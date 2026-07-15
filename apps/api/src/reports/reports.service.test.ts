import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';

import type { ProcurementReport } from '@compras/contracts';

import { buildProcurementCsv, buildProcurementXlsx } from './reports.service.js';

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
