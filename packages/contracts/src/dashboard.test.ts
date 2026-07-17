import { describe, expect, it } from 'vitest';

import { dashboardFiltersSchema } from './dashboard.js';

describe('dashboard contracts', () => {
  it('includes undated history by default and parses query booleans', () => {
    expect(dashboardFiltersSchema.parse({})).toEqual({ includeUndated: true });
    expect(dashboardFiltersSchema.parse({ includeUndated: 'false' })).toEqual({
      includeUndated: false,
    });
  });

  it('rejects an inverted period', () => {
    expect(() =>
      dashboardFiltersSchema.parse({
        dateFrom: '2026-07-31',
        dateTo: '2026-07-01',
      }),
    ).toThrow(/data inicial/i);
  });
});
