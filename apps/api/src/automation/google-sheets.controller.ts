import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  applySheetSyncInputSchema,
  type ApplySheetSyncInput,
  googleSheetsIntegrationInputSchema,
  type GoogleSheetsIntegrationInput,
  type OrganizationSummary,
  sheetWorkbookUploadConstraints,
} from '@compras/contracts';
import { memoryStorage } from 'multer';

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

  @Post('check')
  @RequirePermission('integration:write')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkConnection(
    @ActiveOrganization() organization: OrganizationSummary,
  ) {
    return this.sync.checkConnection(organization.id);
  }

  @Post('workbook-preview')
  @RequirePermission('integration:write')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: sheetWorkbookUploadConstraints.maximumBytes },
    }),
  )
  previewWorkbook(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.sync.previewWorkbook(actor, organization.id, file);
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
