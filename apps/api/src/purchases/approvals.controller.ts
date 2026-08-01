import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  createApprovalRuleInputSchema,
  type CreateApprovalRuleInput,
  type OrganizationSummary,
  recordApprovalDecisionInputSchema,
  type RecordApprovalDecisionInput,
  updateApprovalRuleInputSchema,
  type UpdateApprovalRuleInput,
  updateApprovalSettingsInputSchema,
  type UpdateApprovalSettingsInput,
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

@Controller('approvals')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(
    @Inject(PurchasesService)
    private readonly purchases: PurchasesService,
  ) {}

  @Get('tasks')
  @RequirePermission('approval:act')
  tasks(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
  ) {
    return this.purchases.approvalTasks(actor, organization.id);
  }

  @Post('decisions')
  @RequirePermission('approval:act')
  decide(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(recordApprovalDecisionInputSchema))
    input: RecordApprovalDecisionInput,
  ) {
    return this.purchases.recordApprovalDecision(actor, organization.id, input);
  }

  @Get('rules')
  @RequirePermission('approval:read')
  rules(@ActiveOrganization() organization: OrganizationSummary) {
    return this.purchases.approvalRules(organization.id);
  }

  @Post('rules')
  @RequirePermission('approval:manage')
  createRule(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createApprovalRuleInputSchema))
    input: CreateApprovalRuleInput,
  ) {
    return this.purchases.createApprovalRule(actor, organization.id, input);
  }

  @Patch('rules/:id')
  @RequirePermission('approval:manage')
  updateRule(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateApprovalRuleInputSchema))
    input: UpdateApprovalRuleInput,
  ) {
    return this.purchases.updateApprovalRule(actor, organization.id, id, input);
  }

  @Get('settings')
  @RequirePermission('approval:read')
  settings(@ActiveOrganization() organization: OrganizationSummary) {
    return this.purchases.approvalSettings(organization.id);
  }

  @Put('settings')
  @RequirePermission('approval:manage')
  updateSettings(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(updateApprovalSettingsInputSchema))
    input: UpdateApprovalSettingsInput,
  ) {
    return this.purchases.updateApprovalSettings(actor, organization.id, input);
  }
}
