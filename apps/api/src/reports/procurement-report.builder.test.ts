import { describe, expect, it } from 'vitest';

import { buildProcurementReport, type ReportPurchaseInput } from './procurement-report.builder.js';

describe('procurement report builder', () => {
  it('consolidates totals and exact department allocations', () => {
    const report = buildProcurementReport({
      dataSource: 'DEMO',
      filters: { dateFrom: '2026-07-01', dateTo: '2026-07-31', status: 'REGISTERED' },
      now: new Date('2026-07-14T12:00:00.000Z'),
      purchases: [purchase()],
    });

    expect(report.totals).toMatchObject({
      purchased: 100,
      negotiatedSavings: 20,
      savingsPercentage: 16.67,
      averageTicket: 100,
      purchaseCount: 1,
      supplierCount: 1,
    });
    expect(report.byDepartment).toEqual([
      expect.objectContaining({ label: 'Assistencial', total: 60, savings: 12 }),
      expect.objectContaining({ label: 'Administrativo', total: 40, savings: 8 }),
    ]);
  });

  it('keeps purchases without a center visible as unallocated', () => {
    const withoutCenter = { ...purchase(), departmentAllocations: [] };
    const report = buildProcurementReport({
      dataSource: 'DATABASE',
      filters: { status: 'REGISTERED' },
      purchases: [withoutCenter],
    });

    expect(report.byDepartment).toContainEqual(
      expect.objectContaining({ key: 'unallocated', total: 100 }),
    );
  });
});

function purchase(): ReportPurchaseInput {
  return {
    id: '71000000-0000-4000-8000-000000000001',
    number: 'PC-001',
    invoiceNumber: 'NF-001',
    issuedAt: '2026-07-10',
    supplierId: '51000000-0000-4000-8000-000000000001',
    supplierName: 'Fornecedor Teste',
    category: 'Materiais',
    source: 'MANUAL',
    status: 'REGISTERED',
    itemCount: 2,
    total: 100,
    negotiatedSavings: 20,
    departmentAllocations: [
      {
        departmentId: '41000000-0000-4000-8000-000000000001',
        departmentName: 'Assistencial',
        amount: 60,
      },
      {
        departmentId: '41000000-0000-4000-8000-000000000002',
        departmentName: 'Administrativo',
        amount: 40,
      },
    ],
  };
}
