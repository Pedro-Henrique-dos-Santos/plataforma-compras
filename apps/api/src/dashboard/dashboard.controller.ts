import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { OrganizationSummary } from '@compras/contracts';

import { AuthGuard } from '../auth/auth.guard.js';
import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly dashboard: DashboardService,
  ) {}

  @Get('summary')
  @RequirePermission('dashboard:read')
  getSummary(@ActiveOrganization() organization: OrganizationSummary) {
    return this.dashboard.getSummary(organization.id);
  }
}
