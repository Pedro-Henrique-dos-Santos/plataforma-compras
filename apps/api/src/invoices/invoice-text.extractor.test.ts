import { describe, expect, it } from 'vitest';

import { isSearchableInvoiceText } from './invoice-pdf.parser.js';
import { extractInvoiceFromText } from './invoice-text.extractor.js';

const searchableInvoice = `
DANFE NF-e Numero da nota: 4521
RAZAO SOCIAL: Fornecedor Exemplo Ltda
CNPJ: 11.222.333/0001-81
Data de emissao: 14/07/2026
Natureza da operacao: Compra de material
Forma de pagamento: Boleto bancario
VALOR TOTAL DA NOTA R$ 1.250,00
CHAVE DE ACESSO 3526 0711 2223 3300 0181 5500 1000 0045 2110 0004 5210
Material hospitalar para uso interno
`;

describe('invoice text extraction', () => {
  it('extracts core fields and creates a reviewable consolidated item', () => {
    const result = extractInvoiceFromText(searchableInvoice, 'PDF_TEXT');
    expect(result.extraction).toMatchObject({
      invoiceNumber: '4521',
      supplierDocument: '11222333000181',
      supplierName: 'Fornecedor Exemplo Ltda',
      issuedAt: '2026-07-14',
      total: 1250,
      triageStatus: 'IN_SCOPE',
    });
    expect(result.extraction.items).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('item consolidado');
  });

  it('adds an explicit warning when OCR supplied the text', () => {
    const result = extractInvoiceFromText(searchableInvoice, 'PDF_OCR');
    expect(result.parser).toBe('PDF_OCR');
    expect(result.warnings.join(' ')).toContain('OCR');
  });

  it('reads Brazilian totals with or without a thousands separator', () => {
    const withoutSeparator = extractInvoiceFromText(
      searchableInvoice.replace('1.250,00', '1250,00'),
      'PDF_TEXT',
    );

    expect(withoutSeparator.extraction.total).toBe(1250);
  });

  it('only sends sufficiently dense PDF text past the OCR gate', () => {
    expect(isSearchableInvoiceText('texto curto')).toBe(false);
    expect(isSearchableInvoiceText(searchableInvoice)).toBe(true);
  });
});
