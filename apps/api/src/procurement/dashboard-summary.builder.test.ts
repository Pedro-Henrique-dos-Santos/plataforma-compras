import { describe, expect, it } from 'vitest';

import { buildDashboardSummary } from './dashboard-summary.builder.js';

describe('buildDashboardSummary', () => {
  it('aggregates department allocations without double counting items', () => {
    const summary = buildDashboardSummary({
      activeSuppliers: 1,
      dataSource: 'DEMO',
      now: new Date('2026-07-14T12:00:00.000Z'),
      purchases: [
        {
          id: 'PC-001',
          supplier: 'Fornecedor',
          issuedAt: new Date('2026-07-10T00:00:00.000Z'),
          total: 100,
          negotiatedSavings: 10,
          category: 'Insumos',
          items: [
            {
              total: 100,
              costCenter: null,
              allocations: [
                { costCenter: 'Assistencial', amount: 60 },
                { costCenter: 'Administrativo', amount: 40 },
              ],
            },
          ],
        },
      ],
    });

    expect(summary.totalPurchased.value).toBe(100);
    expect(summary.spendByDepartment).toEqual([
      { department: 'Assistencial', value: 60, color: '#267a78' },
      { department: 'Administrativo', value: 40, color: '#b57a18' },
    ]);
    expect(summary.spendByDepartment.reduce((sum, item) => sum + item.value, 0)).toBe(100);
  });

  it('returns a null variation when there is no comparison base', () => {
    const summary = buildDashboardSummary({
      activeSuppliers: 0,
      dataSource: 'DATABASE',
      now: new Date('2026-07-14T12:00:00.000Z'),
      purchases: [],
    });

    expect(summary.totalPurchased.variation).toBe(0);
    expect(summary.spendByDepartment).toEqual([]);
  });
});
