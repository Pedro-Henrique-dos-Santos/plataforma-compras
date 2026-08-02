import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  purchaseAuditFiltersSchema,
  type OrganizationSummary,
  type PurchaseAuditFilters,
} from '@compras/contracts';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuditService } from './audit.service.js';

@Controller('audit')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get('purchases')
  @RequirePermission('purchase:read')
  listPurchaseEvents(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(purchaseAuditFiltersSchema)) filters: PurchaseAuditFilters,
  ) {
    return this.audit.listPurchaseEvents(organization.id, filters);
  }
}
