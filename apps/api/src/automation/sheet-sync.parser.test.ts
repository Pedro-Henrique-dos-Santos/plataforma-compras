import { describe, expect, it } from 'vitest';

import {
  parseBrazilianDate,
  parseLocaleNumber,
  parseSheetWorkbook,
} from './sheet-sync.parser.js';
import type { SheetWorkbook, StoredGoogleSheetsIntegration } from './sheet-sync.types.js';

const integration: StoredGoogleSheetsIntegration = {
  id: '81000000-0000-4000-8000-000000000001',
  spreadsheetId: '1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4',
  spreadsheetTitle: 'Planilha de valores negociados',
  itemsSheetName: 'Itens do Pedido',
  installmentsSheetName: 'Parcelas do Pedido',
  suppliersSheetName: 'Cadastro de Fornecedores',
  pricesSheetName: 'Tabela de Precos Negociados',
  headerRow: 1,
  enabled: true,
  lastStatus: 'NEVER_SYNCED',
  lastSyncedAt: null,
  lastError: null,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};

describe('Google Sheets parser', () => {
  it('parses the normalized purchasing tabs and groups purchase items', () => {
    const parsed = parseSheetWorkbook(workbook(), integration);

    expect(parsed.suppliers).toHaveLength(1);
    expect(parsed.suppliers[0]).toMatchObject({
      document: '43043093000144',
      legalName: 'Be Life Clinica LTDA',
      costCenterName: 'Farmacia',
    });
    expect(parsed.prices[0]).toMatchObject({
      description: 'Carreto',
      initialPrice: 1500,
      negotiatedPrice: 1000,
    });
    expect(parsed.purchases).toHaveLength(1);
    expect(parsed.purchases[0]).toMatchObject({
      number: 'PED-2026-0004',
      invoiceNumber: '3304',
      issuedAt: '2026-06-22',
      paymentMethod: null,
    });
    expect(parsed.purchases[0]?.items).toHaveLength(2);
    expect(parsed.purchases[0]?.installments).toEqual([
      expect.objectContaining({ dueDate: '2026-07-02', amount: 1_250 }),
    ]);
    expect(parsed.issues).toEqual([]);
  });

  it('handles Brazilian monetary and date formats without floating locale guesses', () => {
    expect(parseLocaleNumber('R$ 35.250,90')).toBe(35_250.9);
    expect(parseLocaleNumber('1.500,00')).toBe(1_500);
    expect(parseLocaleNumber('750')).toBe(750);
    expect(parseBrazilianDate('29/02/2024')).toBe('2024-02-29');
    expect(parseBrazilianDate('31/02/2024')).toBeNull();
  });

  it('matches configured sheet names without depending on accents', () => {
    const source = workbook();
    const prices = source.tables['Tabela de Precos Negociados'];
    delete source.tables['Tabela de Precos Negociados'];
    if (prices) {
      source.tables['Tabela de Preços Negociados'] = {
        ...prices,
        name: 'Tabela de Preços Negociados',
      };
    }

    expect(parseSheetWorkbook(source, integration).prices).toHaveLength(1);
  });

  it('merges legacy purchases without duplicating normalized orders', () => {
    const source = workbook();
    source.tables['valores negociados'] = {
      name: 'valores negociados',
      values: [
        [
          'Numero do Pedido',
          'Unidade',
          'Prestador de Servicos',
          'Categoria',
          'Descricao da Compra',
          'Valor inicial',
          'Valor negociado',
          'Data de Emissao',
          'Documento',
        ],
        [
          '',
          'Matriz',
          'Be Life Clinica LTDA',
          'Servicos',
          'Servico historico',
          800,
          600,
          '25/06/2026',
          '171',
        ],
        [
          'PED-2026-0004',
          'Matriz',
          'Be Life Clinica LTDA',
          'Servicos',
          'Pedido ja normalizado',
          1500,
          1250,
          '22/06/2026',
          '3304',
        ],
        [
          '',
          'Matriz',
          'Be Life Clinica LTDA',
          'Servicos',
          'Compra sem data',
          300,
          250,
          '',
          '',
        ],
      ],
    };

    const parsed = parseSheetWorkbook(source, integration);
    const legacy = parsed.purchases.find((purchase) => purchase.invoiceNumber === '171');
    const undated = parsed.purchases.find((purchase) => purchase.issuedAt === null);

    expect(parsed.sourceRows).toBe(8);
    expect(parsed.purchases).toHaveLength(3);
    expect(legacy).toMatchObject({
      invoiceNumber: '171',
      issuedAt: '2026-06-25',
      supplierName: 'Be Life Clinica LTDA',
    });
    expect(legacy?.items[0]).toMatchObject({
      quantity: 1,
      unitPrice: 800,
      negotiatedPrice: 600,
      costCenterName: 'Farmacia',
    });
    expect(undated).toMatchObject({
      issuedAt: null,
      supplierName: 'Be Life Clinica LTDA',
      notes: expect.stringContaining('Data de emissao ausente'),
    });
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'SKIP_DUPLICATE', rowNumbers: [3] }),
      ]),
    );
    expect(parsed.issues.some((issue) => issue.rowNumbers.includes(4))).toBe(false);
    expect(parsed.warnings).toContain(
      '1 compras historicas sem data serao preservadas e sinalizadas para revisao.',
    );
  });
});

function workbook(): SheetWorkbook {
  return {
    spreadsheetTitle: 'Planilha de valores negociados',
    tables: {
      'Cadastro de Fornecedores': {
        name: 'Cadastro de Fornecedores',
        values: [
          [
            'ID do Fornecedor',
            'CNPJ do Fornecedor',
            'Razao Social',
            'Nome Comercial',
            'E-mail',
            'Categoria Padrao',
            'Natureza da Operacao Padrao',
            'Metodo de Pagamento Padrao',
            'Centro de Custo Padrao',
            'Status',
          ],
          [
            'FOR-1',
            '43.043.093/0001-44',
            'Be Life Clinica LTDA',
            'Be Life',
            'compras@belife.test',
            'Servicos',
            'Venda de servicos',
            '',
            'Farmacia',
            'Ativo',
          ],
        ],
      },
      'Tabela de Precos Negociados': {
        name: 'Tabela de Precos Negociados',
        values: [
          [
            'Fornecedor',
            'CNPJ',
            'Item Padronizado',
            'Unidade de Medida',
            'Valor Unitario Inicial',
            'Valor Unitario Negociado',
            'Centro de Custo',
            'ID do Preco',
            'Status',
          ],
          [
            'Be Life Clinica LTDA',
            '43.043.093/0001-44',
            'Carreto',
            'Servico',
            'R$ 1.500,00',
            'R$ 1.000,00',
            'Farmacia',
            'PRC-1',
            'Ativo',
          ],
        ],
      },
      'Itens do Pedido': {
        name: 'Itens do Pedido',
        values: [
          [
            'Numero do Pedido',
            'Data de Emissao da Nota Fiscal',
            'Fornecedor',
            'Categoria',
            'Descricao Geral da Compra',
            'Item',
            'Centro de Custo',
            'Quantidade',
            'Unidade de Medida',
            'Valor Unitario Inicial',
            'Valor Unitario Negociado',
            'Natureza da Operacao',
            'Metodo de Pagamento',
            'Numero da Nota Fiscal',
            'Status',
          ],
          [
            'PED-2026-0004',
            '22/06/2026',
            'Be Life Clinica LTDA',
            'Servicos',
            'Transporte de materiais',
            'Carreto A',
            'Farmacia',
            '1',
            'Servico',
            'R$ 900,00',
            'R$ 750,00',
            'Venda de servicos',
            '',
            '3304',
            'Finalizado',
          ],
          [
            'PED-2026-0004',
            '22/06/2026',
            'Be Life Clinica LTDA',
            'Servicos',
            'Transporte de materiais',
            'Carreto B',
            'Farmacia',
            '1',
            'Servico',
            'R$ 600,00',
            'R$ 500,00',
            'Venda de servicos',
            '',
            '3304',
            'Finalizado',
          ],
        ],
      },
      'Parcelas do Pedido': {
        name: 'Parcelas do Pedido',
        values: [
          ['Numero do Pedido', 'Data de Vencimento', 'Valor da Parcela'],
          ['PED-2026-0004', '02/07/2026', '1.250,00'],
        ],
      },
    },
  };
}
