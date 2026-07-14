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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  invoiceDocumentStatusSchema,
  invoiceReviewInputSchema,
  invoiceUploadConstraints,
  type InvoiceReviewInput,
  rejectInvoiceDocumentInputSchema,
  type RejectInvoiceDocumentInput,
  type OrganizationSummary,
} from '@compras/contracts';
import { memoryStorage } from 'multer';
import { z } from 'zod';

import { ActiveOrganization } from '../access/active-organization.decorator.js';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { InvoiceDocumentsService } from './invoice-documents.service.js';

const querySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: invoiceDocumentStatusSchema.optional(),
});

@Controller('invoice-documents')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class InvoiceDocumentsController {
  constructor(
    @Inject(InvoiceDocumentsService)
    private readonly invoices: InvoiceDocumentsService,
  ) {}

  @Get()
  @RequirePermission('invoice:read')
  list(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>,
  ) {
    return this.invoices.list(organization.id, query);
  }

  @Get(':id')
  @RequirePermission('invoice:read')
  find(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.invoices.find(organization.id, id);
  }

  @Post('upload')
  @RequirePermission('invoice:write')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: invoiceUploadConstraints.maximumPdfBytes },
    }),
  )
  upload(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.invoices.upload(actor, organization.id, file);
  }

  @Post(':id/reprocess')
  @RequirePermission('invoice:write')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reprocess(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.invoices.reprocess(actor, organization.id, id);
  }

  @Patch(':id/review')
  @RequirePermission('invoice:write')
  review(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(invoiceReviewInputSchema)) input: InvoiceReviewInput,
  ) {
    return this.invoices.review(actor, organization.id, id, input);
  }

  @Post(':id/reject')
  @RequirePermission('invoice:write')
  reject(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(rejectInvoiceDocumentInputSchema))
    input: RejectInvoiceDocumentInput,
  ) {
    return this.invoices.reject(actor, organization.id, id, input.reason);
  }

  @Post(':id/import')
  @RequirePermission('invoice:write')
  import(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.invoices.import(actor, organization.id, id);
  }
}
