import { Injectable } from '@nestjs/common';
import type { DashboardSummary } from '@compras/contracts';

import { demoDashboards } from '../demo/demo.data.js';

@Injectable()
export class DashboardService {
  getSummary(organizationId: string): DashboardSummary {
    const summary = demoDashboards[organizationId];
    return summary ?? emptyDashboard();
  }
}

function emptyDashboard(): DashboardSummary {
  return {
    periodLabel: 'Julho de 2026',
    totalPurchased: { value: 0, variation: 0 },
    negotiatedSavings: { value: 0, variation: 0 },
    activeSuppliers: 0,
    registeredPurchases: 0,
    monthlySpend: [
      { month: 'Fev', value: 0 },
      { month: 'Mar', value: 0 },
      { month: 'Abr', value: 0 },
      { month: 'Mai', value: 0 },
      { month: 'Jun', value: 0 },
      { month: 'Jul', value: 0 },
    ],
    spendByCategory: [],
    recentPurchases: [],
  };
}
