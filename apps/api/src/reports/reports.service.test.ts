import { describe, expect, it } from 'vitest';

import type { ProcurementReport } from '@compras/contracts';

import { buildProcurementCsv } from './reports.service.js';

describe('procurement CSV export', () => {
  it('uses Excel-friendly separators and neutralizes formula injection', () => {
    const csv = buildProcurementCsv(report('=FORNECEDOR!A1'));

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Pedido";"Nota fiscal"');
    expect(csv).toContain('"\'=FORNECEDOR!A1"');
    expect(csv).toContain('"100,00"');
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
    bySupplier: [],
    byCategory: [],
    byDepartment: [],
    byMonth: [],
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
