import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  accountsPayableFiltersSchema,
  type AccountsPayableFilters,
  type OrganizationSummary,
  schedulePayableInputSchema,
  type SchedulePayableInput,
  updatePayableInputSchema,
  type UpdatePayableInput,
} from '@compras/contracts';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { PurchasesService } from './purchases.service.js';
import { buildAccountsPayableWorkbook } from '../reports/accounts-payable-workbook.js';

@Controller('payables')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class PayablesController {
  constructor(
    @Inject(PurchasesService)
    private readonly purchases: PurchasesService,
  ) {}

  @Get()
  @RequirePermission('payable:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(accountsPayableFiltersSchema))
    filters: AccountsPayableFilters,
  ) {
    return this.purchases.accountsPayable(organization.id, filters);
  }

  @Get('export.xlsx')
  @RequirePermission('report:export')
  async export(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(accountsPayableFiltersSchema))
    filters: AccountsPayableFilters,
  ) {
    const report = await this.purchases.accountsPayable(organization.id, filters);
    const workbook = await buildAccountsPayableWorkbook(report, organization.name);
    const fileName = `contas-a-pagar-${organization.slug}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    return new StreamableFile(workbook, {
      disposition: `attachment; filename="${fileName}"`,
      length: workbook.length,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  @Patch(':purchaseId/installments/:sequence')
  @RequirePermission('payable:write')
  update(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Param('sequence', ParseIntPipe) sequence: number,
    @Body(new ZodValidationPipe(updatePayableInputSchema))
    input: UpdatePayableInput,
  ) {
    return this.purchases.updatePayable(
      actor,
      organization.id,
      purchaseId,
      sequence,
      input,
    );
  }

  @Post(':purchaseId/installments')
  @RequirePermission('payable:write')
  schedule(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body(new ZodValidationPipe(schedulePayableInputSchema))
    input: SchedulePayableInput,
  ) {
    return this.purchases.schedulePayable(
      actor,
      organization.id,
      purchaseId,
      input,
    );
  }
}
