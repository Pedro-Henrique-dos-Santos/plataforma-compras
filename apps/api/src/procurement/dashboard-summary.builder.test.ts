import { describe, expect, it } from 'vitest';

import {
  buildDashboardSummary,
  previousDashboardPeriodFilters,
} from './dashboard-summary.builder.js';

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

  it('compares a closed range with the immediately preceding range of equal duration', () => {
    const summary = buildDashboardSummary({
      activeSuppliers: 1,
      dataSource: 'DATABASE',
      filters: {
        dateFrom: '2026-07-10',
        dateTo: '2026-07-19',
        includeUndated: false,
      },
      previousPeriodTotals: {
        purchased: 100,
        negotiatedSavings: 20,
      },
      purchases: [
        {
          id: 'PC-CURRENT',
          supplier: 'Fornecedor',
          issuedAt: new Date('2026-07-15T00:00:00.000Z'),
          createdAt: new Date('2026-07-15T12:00:00.000Z'),
          total: 150,
          negotiatedSavings: 30,
          category: 'Insumos',
          items: [{ total: 150, costCenter: 'Assistencial', allocations: [] }],
        },
      ],
    });

    expect(previousDashboardPeriodFilters({
      dateFrom: '2026-07-10',
      dateTo: '2026-07-19',
      includeUndated: true,
    })).toEqual({
      dateFrom: '2026-06-30',
      dateTo: '2026-07-09',
      includeUndated: false,
    });
    expect(summary.totalPurchased.variation).toBe(50);
    expect(summary.negotiatedSavings.variation).toBe(50);
  });

  it('does not invent a percentage when the previous range has no monetary base', () => {
    const summary = buildDashboardSummary({
      activeSuppliers: 1,
      dataSource: 'DATABASE',
      filters: {
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        includeUndated: false,
      },
      previousPeriodTotals: {
        purchased: 0,
        negotiatedSavings: 0,
      },
      purchases: [
        {
          id: 'PC-FIRST',
          supplier: 'Fornecedor',
          issuedAt: new Date('2026-07-15T00:00:00.000Z'),
          createdAt: new Date('2026-07-15T12:00:00.000Z'),
          total: 100,
          negotiatedSavings: 10,
          category: null,
          items: [{ total: 100, costCenter: null, allocations: [] }],
        },
      ],
    });

    expect(summary.totalPurchased.variation).toBeNull();
    expect(summary.negotiatedSavings.variation).toBeNull();
  });
});
