import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  configureFiscalIntegrationMetadataSchema,
  attachPixQrInputSchema,
  createGoodsReceiptInputSchema,
  createPaymentApprovalRuleInputSchema,
  fiscalDocumentFiltersSchema,
  fiscalIntegrationVersionQuerySchema,
  manifestFiscalDocumentInputSchema,
  payableKanbanFiltersSchema,
  paymentInstructionInputSchema,
  paymentSettlementInputSchema,
  receiptResponsibilityInputSchema,
  recordPaymentApprovalDecisionInputSchema,
  requestAdvancePaymentInputSchema,
  reviewFiscalDocumentMatchInputSchema,
  submitPaymentApprovalInputSchema,
  updatePaymentApprovalRuleInputSchema,
  updatePaymentSettingsInputSchema,
  type ConfigureFiscalIntegrationMetadata,
  type AttachPixQrInput,
  type CreateGoodsReceiptInput,
  type CreatePaymentApprovalRuleInput,
  type FiscalDocumentFilters,
  type FiscalIntegrationVersionQuery,
  type ManifestFiscalDocumentInput,
  type OrganizationSummary,
  type PayableKanbanFilters,
  type PaymentInstructionInput,
  type PaymentSettlementInput,
  type ReceiptResponsibilityInput,
  type RecordPaymentApprovalDecisionInput,
  type RequestAdvancePaymentInput,
  type ReviewFiscalDocumentMatchInput,
  type SubmitPaymentApprovalInput,
  type UpdatePaymentApprovalRuleInput,
  type UpdatePaymentSettingsInput,
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
import { ProcureToPayService } from './procure-to-pay.service.js';

@Controller('procure-to-pay')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
export class ProcureToPayController {
  constructor(
    @Inject(ProcureToPayService)
    private readonly service: ProcureToPayService,
  ) {}

  @Get('payables')
  @RequirePermission('payable:read')
  listPayables(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(payableKanbanFiltersSchema)) filters: PayableKanbanFilters,
  ) {
    return this.service.listPayables(organization.id, filters);
  }

  @Get('payment-settings')
  @RequirePermission('payment-approval:read')
  paymentSettings(@ActiveOrganization() organization: OrganizationSummary) {
    return this.service.getPaymentSettings(organization.id);
  }

  @Patch('payment-settings')
  @RequirePermission('payment-approval:manage')
  updatePaymentSettings(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(updatePaymentSettingsInputSchema)) input: UpdatePaymentSettingsInput,
  ) {
    return this.service.updatePaymentSettings(actor, organization.id, input);
  }

  @Get('payment-rules')
  @RequirePermission('payment-approval:read')
  paymentRules(@ActiveOrganization() organization: OrganizationSummary) {
    return this.service.listPaymentRules(organization.id);
  }

  @Post('payment-rules')
  @RequirePermission('payment-approval:manage')
  createPaymentRule(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(createPaymentApprovalRuleInputSchema)) input: CreatePaymentApprovalRuleInput,
  ) {
    return this.service.createPaymentRule(actor, organization.id, input);
  }

  @Patch('payment-rules/:id')
  @RequirePermission('payment-approval:manage')
  updatePaymentRule(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePaymentApprovalRuleInputSchema)) input: UpdatePaymentApprovalRuleInput,
  ) {
    return this.service.updatePaymentRule(actor, organization.id, id, input);
  }

  @Put('payables/:id/instruction')
  @RequirePermission('payable:write')
  savePaymentInstruction(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(paymentInstructionInputSchema)) input: PaymentInstructionInput,
  ) {
    return this.service.savePaymentInstruction(actor, organization.id, id, input);
  }

  @Post('payment-approvals')
  @RequirePermission('payable:write')
  submitPaymentApproval(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(submitPaymentApprovalInputSchema)) input: SubmitPaymentApprovalInput,
  ) {
    return this.service.submitPaymentApproval(actor, organization.id, input);
  }

  @Post('payables/:id/pix-qr')
  @RequirePermission('payable:write')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    }),
  )
  attachPixQr(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(attachPixQrInputSchema)) input: AttachPixQrInput,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return this.service.attachPixQrImage(actor, organization.id, id, input, image);
  }

  @Get('payables/:id/pix-qr-url')
  @RequirePermission('payable:read')
  pixQrUrl(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.pixQrFileUrl(organization.id, id);
  }

  @Post('payables/:id/advance')
  @RequirePermission('payable:write')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('evidence', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
    }),
  )
  requestAdvancePayment(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(requestAdvancePaymentInputSchema))
    input: RequestAdvancePaymentInput,
    @UploadedFile() evidence: Express.Multer.File,
  ) {
    return this.service.requestAdvancePayment(actor, organization.id, id, input, evidence);
  }

  @Get('payables/:id/advance-evidence-url')
  @RequirePermission('payable:read')
  advanceEvidenceUrl(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.advanceEvidenceFileUrl(organization.id, id);
  }

  @Get('payment-approvals/tasks')
  @RequirePermission('payment-approval:read')
  paymentApprovalTasks(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
  ) {
    return this.service.listPaymentApprovalTasks(actor, organization.id);
  }

  @Post('payment-approvals/decisions')
  @RequirePermission('payment-approval:act')
  decidePaymentApproval(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(recordPaymentApprovalDecisionInputSchema)) input: RecordPaymentApprovalDecisionInput,
  ) {
    return this.service.recordPaymentApprovalDecision(actor, organization.id, input);
  }

  @Post('payables/:id/settlements')
  @RequirePermission('payment:settle')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('proof', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
    }),
  )
  settlePayment(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(paymentSettlementInputSchema)) input: PaymentSettlementInput,
    @UploadedFile() proof: Express.Multer.File,
  ) {
    return this.service.settlePayment(actor, organization.id, id, input, proof);
  }

  @Get('settlements/:id/proof-url')
  @RequirePermission('payable:read')
  paymentProofUrl(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.paymentProofFileUrl(organization.id, id);
  }

  @Get('purchases/:purchaseId/receipts')
  @RequirePermission('receipt:read')
  receipts(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ) {
    return this.service.listGoodsReceipts(organization.id, purchaseId);
  }

  @Get('purchases/:purchaseId/receipt-fiscal-items')
  @RequirePermission('receipt:read')
  receiptFiscalItems(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ) {
    return this.service.listReceiptFiscalItems(organization.id, purchaseId);
  }

  @Post('purchases/:purchaseId/receipts')
  @RequirePermission('receipt:write')
  createReceipt(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body(new ZodValidationPipe(createGoodsReceiptInputSchema)) input: CreateGoodsReceiptInput,
  ) {
    return this.service.createGoodsReceipt(actor, organization.id, purchaseId, input);
  }

  @Get('receipt-responsibilities')
  @RequirePermission('receipt:read')
  receiptResponsibilities(@ActiveOrganization() organization: OrganizationSummary) {
    return this.service.listReceiptResponsibilities(organization.id);
  }

  @Post('receipt-responsibilities')
  @RequirePermission('organization:manage')
  addReceiptResponsibility(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(receiptResponsibilityInputSchema)) input: ReceiptResponsibilityInput,
  ) {
    return this.service.addReceiptResponsibility(actor, organization.id, input);
  }

  @Delete('receipt-responsibilities/:id')
  @RequirePermission('organization:manage')
  removeReceiptResponsibility(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeReceiptResponsibility(actor, organization.id, id);
  }

  @Get('fiscal/integration')
  @RequirePermission('invoice:read')
  fiscalIntegration(@ActiveOrganization() organization: OrganizationSummary) {
    return this.service.getFiscalIntegration(organization.id);
  }

  @Put('fiscal/integration')
  @RequirePermission('fiscal-integration:manage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('certificate', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    }),
  )
  configureFiscalIntegration(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Body(new ZodValidationPipe(configureFiscalIntegrationMetadataSchema)) metadata: ConfigureFiscalIntegrationMetadata,
    @UploadedFile() certificate: Express.Multer.File,
  ) {
    return this.service.configureFiscalIntegration(actor, organization.id, metadata, certificate);
  }

  @Delete('fiscal/integration')
  @RequirePermission('fiscal-integration:manage')
  revokeFiscalIntegration(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(fiscalIntegrationVersionQuerySchema)) query: FiscalIntegrationVersionQuery,
  ) {
    return this.service.revokeFiscalIntegration(
      actor,
      organization.id,
      query.expectedUpdatedAt,
    );
  }

  @Post('fiscal/integration/test')
  @RequirePermission('fiscal-integration:manage')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  testFiscalIntegration(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
  ) {
    return this.service.testFiscalIntegration(actor, organization.id);
  }

  @Post('fiscal/sync')
  @RequirePermission('fiscal-integration:manage')
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  syncFiscal(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
  ) {
    return this.service.syncFiscalNow(actor, organization.id);
  }

  @Get('fiscal/documents')
  @RequirePermission('invoice:read')
  fiscalDocuments(
    @ActiveOrganization() organization: OrganizationSummary,
    @Query(new ZodValidationPipe(fiscalDocumentFiltersSchema)) filters: FiscalDocumentFilters,
  ) {
    return this.service.listFiscalDocuments(organization.id, filters);
  }

  @Get('fiscal/documents/:id/file-url')
  @RequirePermission('invoice:read')
  fiscalDocumentFileUrl(
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.fiscalDocumentFileUrl(organization.id, id);
  }

  @Post('fiscal/documents/:id/review')
  @RequirePermission('invoice:write')
  reviewFiscalDocument(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewFiscalDocumentMatchInputSchema)) input: ReviewFiscalDocumentMatchInput,
  ) {
    return this.service.reviewFiscalDocumentMatch(actor, organization.id, id, input);
  }

  @Post('fiscal/documents/:id/manifest')
  @RequirePermission('fiscal-integration:manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  manifestFiscalDocument(
    @CurrentUser() actor: AuthenticatedIdentity,
    @ActiveOrganization() organization: OrganizationSummary,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(manifestFiscalDocumentInputSchema)) input: ManifestFiscalDocumentInput,
  ) {
    return this.service.manifestFiscalDocument(actor, organization.id, id, input);
  }
}
