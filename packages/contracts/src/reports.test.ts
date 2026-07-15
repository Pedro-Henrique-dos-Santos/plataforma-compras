import { describe, expect, it } from 'vitest';

import { procurementReportFiltersSchema, procurementReportSchema } from './reports.js';

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
});
