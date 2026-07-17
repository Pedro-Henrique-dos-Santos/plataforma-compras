import { describe, expect, it } from 'vitest';

import { HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import { DemoProcurementRepository } from '../procurement/demo-procurement.repository.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  it('returns an organization-scoped summary', async () => {
    const service = new DashboardService(new DemoProcurementRepository());
    const summary = await service.getSummary(HUMAN_CLINIC_ID, { includeUndated: true });

    expect(summary.totalPurchased.value).toBeGreaterThan(0);
    expect(summary.recentPurchases.length).toBeGreaterThan(0);
    expect(summary.spendByDepartment.length).toBeGreaterThan(0);
  });

  it('returns an empty summary for a newly created organization', async () => {
    const service = new DashboardService(new DemoProcurementRepository());
    const summary = await service.getSummary('99999999-9999-4999-8999-999999999999', {
      includeUndated: true,
    });

    expect(summary.totalPurchased.value).toBe(0);
    expect(summary.recentPurchases).toEqual([]);
  });
});
