import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  changeReceivableStatusInputSchema,
  createReceivableInputSchema,
  createReceivableSettlementInputSchema,
  receivableFiltersSchema,
  updateReceivableInputSchema,
  type ChangeReceivableStatusInput,
  type CreateReceivableInput,
  type CreateReceivableSettlementInput,
  type OrganizationSummary,
  type ReceivableFilters,
  type UpdateReceivableInput,
} from '@compras/contracts';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { ReceivablesService } from './receivables.service.js';

@Controller('receivables')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class ReceivablesController {
  constructor(
    @Inject(ReceivablesService)
    private readonly service: ReceivablesService,
  ) {}

  @Get()
  @RequirePermission('receivable:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(receivableFiltersSchema)) filters: ReceivableFilters,
  ) {
    return this.service.list(organization.id, filters);
  }

  @Get('report')
  @RequirePermission('receivable:read')
  report(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(receivableFiltersSchema)) filters: ReceivableFilters,
  ) {
    return this.service.report(organization.id, filters);
  }

  @Get('export.xlsx')
  @RequirePermission('report:export')
  async exportWorkbook(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(receivableFiltersSchema)) filters: ReceivableFilters,
  ) {
    const workbook = await this.service.exportWorkbook(
      organization.id,
      organization.name,
      filters,
    );
    return new StreamableFile(workbook, {
      disposition: `attachment; filename="contas-a-receber-${organization.slug}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      length: workbook.length,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  @Post()
  @RequirePermission('receivable:write')
  create(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createReceivableInputSchema)) input: CreateReceivableInput,
  ) {
    return this.service.create(actor, organization.id, input);
  }

  @Patch(':id')
  @RequirePermission('receivable:write')
  update(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReceivableInputSchema)) input: UpdateReceivableInput,
  ) {
    return this.service.update(actor, organization.id, id, input);
  }

  @Post(':id/settlements')
  @RequirePermission('receivable:settle')
  settle(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createReceivableSettlementInputSchema))
    input: CreateReceivableSettlementInput,
  ) {
    return this.service.settle(actor, organization.id, id, input);
  }

  @Patch(':id/status')
  @RequirePermission('receivable:write')
  changeStatus(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeReceivableStatusInputSchema))
    input: ChangeReceivableStatusInput,
  ) {
    return this.service.changeStatus(actor, organization.id, id, input);
  }
}
