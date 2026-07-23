import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';

import type { ProcurementDetailedReport, ProcurementReport } from '@compras/contracts';

import {
  buildDetailedProcurementXlsx,
  buildProcurementCsv,
  buildProcurementXlsx,
} from './reports.service.js';

describe('procurement CSV export', () => {
  it('uses Excel-friendly separators and neutralizes formula injection', () => {
    const csv = buildProcurementCsv(report('=FORNECEDOR!A1'));

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Pedido";"Nota fiscal"');
    expect(csv).toContain('"\'=FORNECEDOR!A1"');
    expect(csv).toContain('"100,00"');
  });
});

describe('procurement Excel export', () => {
  it('creates a structured workbook and keeps imported text inert', async () => {
    const buffer = await buildProcurementXlsx(report('=FORNECEDOR!A1'));
    const workbook = new Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Compras',
      'Departamentos',
      'Fornecedores',
      'Categorias',
      'Meses',
    ]);
    expect(workbook.getWorksheet('Compras')?.getCell('D2').value).toBe("'=FORNECEDOR!A1");
    expect(workbook.getWorksheet('Departamentos')?.getCell('A2').value).toBe(
      'Administrativo',
    );
    expect(workbook.getWorksheet('Departamentos')?.getCell('C2').value).toBe(100);
    expect(workbook.getWorksheet('Compras')?.getColumn(4).width).toBe(48);
    expect(workbook.getWorksheet('Compras')?.getCell('D2').alignment.wrapText).toBe(true);
    expect(workbook.getWorksheet('Fornecedores')?.getColumn(1).width).toBe(52);
    expect(workbook.getWorksheet('Fornecedores')?.getCell('A2').alignment.wrapText).toBe(true);
  });

  it('creates a detailed workbook with operational audit sheets', async () => {
    const buffer = await buildDetailedProcurementXlsx(detailedReport('=FORNECEDOR!A1'));
    const workbook = new Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Compras',
      'Departamentos',
      'Fornecedores',
      'Categorias',
      'Meses',
      'Compras detalhadas',
      'Itens detalhados',
      'Itens por mes',
      'Rateios',
      'Parcelas',
      'Notas fiscais',
      'Dados fornecedores',
    ]);
    expect(workbook.getWorksheet('Compras detalhadas')?.getCell('D2').value).toBe(
      "'=FORNECEDOR!A1",
    );
    expect(workbook.getWorksheet('Itens detalhados')?.getCell('E2').value).toBe(
      "'=ITEM!A1",
    );
    expect(workbook.getWorksheet('Itens por mes')?.getCell('A2').value).toBe('Jul/2026');
    expect(workbook.getWorksheet('Itens por mes')?.getCell('B2').value).toBe("'=ITEM!A1");
    expect(workbook.getWorksheet('Itens por mes')?.getCell('G2').value).toBe(100);
    expect(workbook.getWorksheet('Rateios')?.getCell('G2').value).toBe(1);
    expect(workbook.getWorksheet('Parcelas')?.getCell('F2').value).toBe(100);
    expect(workbook.getWorksheet('Notas fiscais')?.getCell('J2').value).toBe('Importada');
    expect(workbook.getWorksheet('Dados fornecedores')?.getCell('A2').value).toBe(
      "'=FORNECEDOR!A1",
    );
  });

  it('labels purchases without an issue date in both Excel formats', async () => {
    const summarySource = report('Fornecedor sem data');
    const detailedSource = detailedReport('Fornecedor sem data');
    const summaryPurchase = summarySource.purchases[0];
    const detailedSummaryPurchase = detailedSource.summary.purchases[0];
    const detailedPurchase = detailedSource.purchases[0];
    if (!summaryPurchase || !detailedSummaryPurchase || !detailedPurchase) {
      throw new Error('Fixture de relatorio incompleta.');
    }
    summaryPurchase.issuedAt = null;
    detailedSummaryPurchase.issuedAt = null;
    detailedPurchase.issuedAt = null;

    const [summaryBuffer, detailedBuffer] = await Promise.all([
      buildProcurementXlsx(summarySource),
      buildDetailedProcurementXlsx(detailedSource),
    ]);
    const summaryWorkbook = new Workbook();
    const detailedWorkbook = new Workbook();
    await Promise.all([
      summaryWorkbook.xlsx.load(Uint8Array.from(summaryBuffer).buffer),
      detailedWorkbook.xlsx.load(Uint8Array.from(detailedBuffer).buffer),
    ]);

    expect(summaryWorkbook.getWorksheet('Compras')?.getCell('C2').value).toBe('Sem data');
    expect(
      detailedWorkbook.getWorksheet('Compras detalhadas')?.getCell('C2').value,
    ).toBe('Sem data');
    expect(detailedWorkbook.getWorksheet('Itens detalhados')?.getCell('C2').value).toBe(
      'Sem data',
    );
    expect(detailedWorkbook.getWorksheet('Itens por mes')?.getCell('A2').value).toBe(
      'Sem data',
    );
  });
});

function report(supplierName: string): ProcurementReport {
  return {
    dataSource: 'DEMO',
    generatedAt: '2026-07-14T12:00:00.000Z',
    period: { dateFrom: null, dateTo: null, label: 'Todo o historico' },
    totals: {
      purchased: 100,
      negotiatedSavings: 10,
      savingsPercentage: 9.09,
      averageTicket: 100,
      purchaseCount: 1,
      supplierCount: 1,
    },
    bySupplier: [
      { key: 'supplier-1', label: supplierName, purchaseCount: 1, total: 100, savings: 10 },
    ],
    byCategory: [
      { key: 'materiais', label: 'Materiais', purchaseCount: 1, total: 100, savings: 10 },
    ],
    byDepartment: [
      {
        key: 'department-1',
        label: 'Administrativo',
        purchaseCount: 1,
        total: 100,
        savings: 10,
      },
    ],
    byMonth: [
      { key: '2026-07', label: 'Jul/2026', purchaseCount: 1, total: 100, savings: 10 },
    ],
    purchases: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        number: 'PC-001',
        invoiceNumber: 'NF-001',
        issuedAt: '2026-07-14',
        supplierId: '51000000-0000-4000-8000-000000000001',
        supplierName,
        category: 'Materiais',
        departments: ['Administrativo'],
        source: 'MANUAL',
        status: 'REGISTERED',
        itemCount: 1,
        total: 100,
        negotiatedSavings: 10,
      },
    ],
  };
}

function detailedReport(supplierName: string): ProcurementDetailedReport {
  return {
    summary: report(supplierName),
    purchases: [
      {
        id: '71000000-0000-4000-8000-000000000001',
        number: 'PC-001',
        invoiceNumber: 'NF-001',
        issuedAt: '2026-07-14',
        status: 'REGISTERED',
        category: 'Materiais',
        operationNature: 'Compra de materiais',
        paymentMethod: 'Boleto',
        notes: 'Compra de homologacao',
        source: 'MANUAL',
        sourceReference: null,
        total: 100,
        negotiatedSavings: 10,
        createdAt: '2026-07-14T12:00:00.000Z',
        supplier: {
          id: '51000000-0000-4000-8000-000000000001',
          legalName: 'Fornecedor de homologacao LTDA',
          tradeName: supplierName,
          document: '11222333000181',
          category: 'Materiais',
          operationNature: 'Venda',
          paymentMethod: 'Boleto',
          email: 'fornecedor@example.com',
          phone: null,
          defaultCostCenter: {
            id: '41000000-0000-4000-8000-000000000001',
            code: 'ADM',
            name: 'Administrativo',
          },
        },
        items: [
          {
            id: '61000000-0000-4000-8000-000000000001',
            description: '=ITEM!A1',
            quantity: 1,
            unit: 'UN',
            unitPrice: 110,
            negotiatedPrice: 100,
            total: 100,
            negotiatedSavings: 10,
            costCenter: null,
            allocations: [
              {
                costCenter: {
                  id: '41000000-0000-4000-8000-000000000001',
                  code: 'ADM',
                  name: 'Administrativo',
                },
                percentage: 100,
                amount: 100,
              },
            ],
          },
        ],
        installments: [
          { sequence: 1, dueDate: '2026-08-14', amount: 100, paidAt: null },
        ],
        invoices: [
          {
            id: '81000000-0000-4000-8000-000000000001',
            invoiceNumber: 'NF-001',
            accessKey: '12345678901234567890123456789012345678901234',
            fileName: 'nota-fiscal.pdf',
            kind: 'PDF',
            status: 'IMPORTED',
            parser: 'pdf-text',
            confidence: 0.95,
            warningCount: 0,
            errorCount: 0,
            processedAt: '2026-07-14T12:01:00.000Z',
            reviewedAt: '2026-07-14T12:02:00.000Z',
            importedAt: '2026-07-14T12:03:00.000Z',
          },
        ],
      },
    ],
  };
}
