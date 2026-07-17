import { describe, expect, it } from 'vitest';

import {
  procurementDetailedReportSchema,
  procurementReportFiltersSchema,
  procurementReportSchema,
} from './reports.js';

describe('procurement report contracts', () => {
  it('defaults operational reports to registered purchases', () => {
    expect(procurementReportFiltersSchema.parse({})).toEqual({ status: 'REGISTERED' });
  });

  it('rejects an inverted period', () => {
    expect(() =>
      procurementReportFiltersSchema.parse({
        dateFrom: '2026-07-31',
        dateTo: '2026-07-01',
      }),
    ).toThrow(/data inicial/i);
  });

  it('accepts a complete report payload', () => {
    expect(
      procurementReportSchema.parse({
        dataSource: 'DEMO',
        generatedAt: '2026-07-14T12:00:00.000Z',
        period: { dateFrom: '2026-07-01', dateTo: '2026-07-31', label: 'Julho de 2026' },
        totals: {
          purchased: 100,
          negotiatedSavings: 20,
          savingsPercentage: 16.67,
          averageTicket: 100,
          purchaseCount: 1,
          supplierCount: 1,
        },
        bySupplier: [],
        byCategory: [],
        byDepartment: [],
        byMonth: [],
        purchases: [],
      }),
    ).toBeDefined();
  });

  it('accepts an empty detailed section alongside a valid summary', () => {
    const summary = procurementReportSchema.parse({
      dataSource: 'DATABASE',
      generatedAt: '2026-07-14T12:00:00.000Z',
      period: { dateFrom: null, dateTo: null, label: 'Todo o historico' },
      totals: {
        purchased: 0,
        negotiatedSavings: 0,
        savingsPercentage: 0,
        averageTicket: 0,
        purchaseCount: 0,
        supplierCount: 0,
      },
      bySupplier: [],
      byCategory: [],
      byDepartment: [],
      byMonth: [],
      purchases: [],
    });

    expect(procurementDetailedReportSchema.parse({ summary, purchases: [] })).toEqual({
      summary,
      purchases: [],
    });
  });
});
