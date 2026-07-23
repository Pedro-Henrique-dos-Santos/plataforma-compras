import { describe, expect, it } from 'vitest';

import { buildDashboardSummary } from './dashboard-summary.builder.js';

describe('buildDashboardSummary', () => {
  it('aggregates the selected period and allocations without double counting items', () => {
    const summary = buildDashboardSummary({
      activeSuppliers: 1,
      dataSource: 'DEMO',
      filters: { includeUndated: true },
      purchases: [
        {
          id: 'PC-001',
          supplier: 'Fornecedor',
          issuedAt: new Date('2026-07-10T00:00:00.000Z'),
          createdAt: new Date('2026-07-10T12:00:00.000Z'),
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

    expect(summary.periodLabel).toBe('Todo o historico');
    expect(summary.totalPurchased.value).toBe(100);
    expect(summary.registeredPurchases).toBe(1);
    expect(summary.spendByDepartment).toEqual([
      { department: 'Assistencial', value: 60, color: '#267a78' },
      { department: 'Administrativo', value: 40, color: '#b57a18' },
    ]);
    expect(summary.spendByDepartment.reduce((sum, item) => sum + item.value, 0)).toBe(100);
  });

  it('keeps undated historical purchases in totals and outside monthly buckets', () => {
    const summary = buildDashboardSummary({
      activeSuppliers: 0,
      dataSource: 'DATABASE',
      filters: { includeUndated: true },
      purchases: [
        {
          id: 'LEG-001',
          supplier: 'Fornecedor historico',
          issuedAt: null,
          createdAt: new Date('2026-07-14T12:00:00.000Z'),
          total: 250,
          negotiatedSavings: 25,
          category: null,
          items: [{ total: 250, costCenter: null, allocations: [] }],
        },
      ],
    });

    expect(summary.totalPurchased.value).toBe(250);
    expect(summary.undatedPurchases).toBe(1);
    expect(summary.monthlySpend).toEqual([]);
    expect(summary.recentPurchases[0]?.date).toBeNull();
    expect(summary.totalPurchased.variation).toBeNull();
  });
});
