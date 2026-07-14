import { Body, Controller, Get, Inject, Post, Put, UseGuards } from '@nestjs/common';
import {
  applySheetSyncInputSchema,
  type ApplySheetSyncInput,
  googleSheetsIntegrationInputSchema,
  type GoogleSheetsIntegrationInput,
  type OrganizationSummary,
} from '@compras/contracts';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { GoogleSheetsSyncService } from './google-sheets-sync.service.js';

@Controller('integrations/google-sheets')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class GoogleSheetsController {
  constructor(
    @Inject(GoogleSheetsSyncService)
    private readonly sync: GoogleSheetsSyncService,
  ) {}

  @Get()
  @RequirePermission('integration:read')
  status(@ActiveOrganization() organization: OrganizationSummary) {
    return this.sync.getStatus(organization.id);
  }

  @Put()
  @RequirePermission('organization:manage')
  configure(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(googleSheetsIntegrationInputSchema))
    input: GoogleSheetsIntegrationInput,
  ) {
    return this.sync.configure(actor, organization.id, input);
  }

  @Post('preview')
  @RequirePermission('integration:write')
  preview(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
  ) {
    return this.sync.preview(actor, organization.id);
  }

  @Post('apply')
  @RequirePermission('integration:write')
  apply(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(applySheetSyncInputSchema)) input: ApplySheetSyncInput,
  ) {
    return this.sync.apply(actor, organization.id, input.runId);
  }
}
