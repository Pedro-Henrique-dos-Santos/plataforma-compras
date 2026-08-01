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
  UseGuards,
} from '@nestjs/common';
import {
  changePurchaseStatusInputSchema,
  changePurchaseWorkflowStageInputSchema,
  type ChangePurchaseStatusInput,
  type ChangePurchaseWorkflowStageInput,
  createPurchaseInputSchema,
  type CreatePurchaseInput,
  isoDateSchema,
  type OrganizationSummary,
  purchaseImportInputSchema,
  type PurchaseImportInput,
  purchaseStatusSchema,
  purchaseWorkflowStageSchema,
  submitPurchaseForApprovalInputSchema,
  type SubmitPurchaseForApprovalInput,
  updatePurchaseInputSchema,
  type UpdatePurchaseInput,
} from '@compras/contracts';
import { z } from 'zod';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { PurchasesService } from './purchases.service.js';

const querySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: purchaseStatusSchema.optional(),
  workflowStage: purchaseWorkflowStageSchema.optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});

@Controller('purchases')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class PurchasesController {
  constructor(
    @Inject(PurchasesService)
    private readonly purchases: PurchasesService,
  ) {}

  @Get()
  @RequirePermission('purchase:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>,
  ) {
    return this.purchases.list(organization.id, query);
  }

  @Get(':id')
  @RequirePermission('purchase:read')
  detail(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchases.detail(organization.id, id);
  }

  @Post()
  @RequirePermission('purchase:write')
  create(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createPurchaseInputSchema)) input: CreatePurchaseInput,
  ) {
    return this.purchases.create(actor, organization.id, input);
  }

  @Patch(':id')
  @RequirePermission('purchase:write')
  update(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePurchaseInputSchema)) input: UpdatePurchaseInput,
  ) {
    return this.purchases.update(actor, organization.id, id, input);
  }

  @Patch(':id/status')
  @RequirePermission('purchase:write')
  changeStatus(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changePurchaseStatusInputSchema))
    input: ChangePurchaseStatusInput,
  ) {
    return this.purchases.changeStatus(actor, organization.id, id, input);
  }

  @Patch(':id/workflow')
  @RequirePermission('purchase:write')
  changeWorkflowStage(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changePurchaseWorkflowStageInputSchema))
    input: ChangePurchaseWorkflowStageInput,
  ) {
    return this.purchases.changeWorkflowStage(
      actor,
      organization.id,
      id,
      input,
      organization.role,
    );
  }

  @Post(':id/submit-approval')
  @RequirePermission('purchase:write')
  submitForApproval(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitPurchaseForApprovalInputSchema))
    input: SubmitPurchaseForApprovalInput,
  ) {
    return this.purchases.submitForApproval(
      actor,
      organization.id,
      id,
      input.expectedUpdatedAt,
    );
  }

  @Post('import')
  @RequirePermission('purchase:write')
  import(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(purchaseImportInputSchema)) input: PurchaseImportInput,
  ) {
    return this.purchases.import(actor, organization.id, input);
  }
}
