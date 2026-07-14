import { describe, expect, it } from 'vitest';

import { HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  it('returns an organization-scoped summary', () => {
    const service = new DashboardService();
    const summary = service.getSummary(HUMAN_CLINIC_ID);

    expect(summary.totalPurchased.value).toBeGreaterThan(0);
    expect(summary.recentPurchases.length).toBeGreaterThan(0);
  });
});

