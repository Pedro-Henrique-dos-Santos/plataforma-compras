import { Inject, Injectable } from '@nestjs/common';
import type { DashboardSummary } from '@compras/contracts';

import { ProcurementRepository } from '../procurement/procurement.repository.js';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(ProcurementRepository)
    private readonly repository: ProcurementRepository,
  ) {}

  getSummary(organizationId: string): Promise<DashboardSummary> {
    return this.repository.getDashboardSummary(organizationId);
  }
}
