import { Injectable, NotFoundException } from '@nestjs/common';
import type { DashboardSummary } from '@compras/contracts';

import { demoDashboards } from '../demo/demo.data.js';

@Injectable()
export class DashboardService {
  getSummary(organizationId: string): DashboardSummary {
    const summary = demoDashboards[organizationId];
    if (!summary) {
      throw new NotFoundException('Dashboard is not available for this organization.');
    }
    return summary;
  }
}

