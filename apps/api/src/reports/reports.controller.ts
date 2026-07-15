import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import {
  procurementReportFiltersSchema,
  type OrganizationSummary,
  type ProcurementReportFilters,
} from '@compras/contracts';
import type { Response } from 'express';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('procurement')
  @RequirePermission('purchase:read')
  getProcurementReport(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(procurementReportFiltersSchema))
    query: ProcurementReportFilters,
  ) {
    return this.reports.getProcurementReport(organization.id, query);
  }

  @Get('procurement.csv')
  @RequirePermission('purchase:read')
  async exportProcurementReport(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(procurementReportFiltersSchema))
    query: ProcurementReportFilters,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.type('text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="relatorio-compras-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return this.reports.exportProcurementCsv(organization.id, query);
  }
}
