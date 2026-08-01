import { z } from 'zod';

import {
  isoDateSchema,
  monetaryValueSchema,
  paymentChannelSchema,
  pixKeyTypeSchema,
} from './master-data.js';
import { organizationDocumentSchema } from './organizations.js';
import { notificationChannelSchema } from './workflow.js';

export const paymentWorkflowStageSchema = z.enum([
  'MATCHING_REQUIRED',
  'AWAITING_APPROVAL',
  'READY_TO_PAY',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
]);
export type PaymentWorkflowStage = z.infer<typeof paymentWorkflowStageSchema>;

export const paymentApprovalModeSchema = z.enum([
  'DISABLED',
  'PER_TITLE',
  'PER_PURCHASE_SNAPSHOT',
]);
export type PaymentApprovalMode = z.infer<typeof paymentApprovalModeSchema>;

export const paymentApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type PaymentApprovalStatus = z.infer<typeof paymentApprovalStatusSchema>;

export const paymentDecisionStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
export type PaymentDecisionStatus = z.infer<typeof paymentDecisionStatusSchema>;

export const fiscalEnvironmentSchema = z.enum(['HOMOLOGATION', 'PRODUCTION']);
export type FiscalEnvironment = z.infer<typeof fiscalEnvironmentSchema>;

export const fiscalIntegrationStatusSchema = z.enum([
  'NOT_CONFIGURED',
  'READY',
  'SYNCING',
  'BACKOFF',
  'CERTIFICATE_EXPIRED',
  'ERROR',
]);
export type FiscalIntegrationStatus = z.infer<typeof fiscalIntegrationStatusSchema>;

export const recipientManifestationModeSchema = z.enum([
  'MANUAL',
  'AUTO_SCIENCE',
]);
export type RecipientManifestationMode = z.infer<
  typeof recipientManifestationModeSchema
>;

export const recipientManifestationSchema = z.enum([
  'SCIENCE',
  'CONFIRMATION',
  'UNKNOWN_OPERATION',
  'OPERATION_NOT_PERFORMED',
]);
export type RecipientManifestation = z.infer<
  typeof recipientManifestationSchema
>;

export const fiscalMatchStatusSchema = z.enum([
  'UNMATCHED',
  'MATCHED_EXACT',
  'MATCHED_MANUAL',
  'REVIEW_REQUIRED',
  'REJECTED',
]);
export type FiscalMatchStatus = z.infer<typeof fiscalMatchStatusSchema>;

export const receiptStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']);
export type ReceiptStatus = z.infer<typeof receiptStatusSchema>;

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

export const paymentSettingsSchema = z.object({
  approvalMode: paymentApprovalModeSchema,
  segregationEnabled: z.boolean(),
  notificationChannel: notificationChannelSchema.nullable(),
  notificationRecipient: z.string().max(255).nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export const updatePaymentSettingsInputSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().nullable().optional().default(null),
    approvalMode: paymentApprovalModeSchema,
    segregationEnabled: z.boolean(),
    notificationChannel: notificationChannelSchema.nullable(),
    notificationRecipient: nullableText(255),
  })
  .superRefine((value, context) => {
    if (
      (value.notificationChannel === null) !==
      (value.notificationRecipient === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o canal e o destinatario financeiro em conjunto.',
        path: ['notificationRecipient'],
      });
    }
  });
export type UpdatePaymentSettingsInput = z.infer<
  typeof updatePaymentSettingsInputSchema
>;

const paymentRuleFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    minimumAmount: monetaryValueSchema,
    requiredApprovals: z.number().int().min(1).max(2),
    notificationChannel: notificationChannelSchema,
    approverUserIds: z.array(z.string().uuid()).min(1).max(20),
    active: z.boolean(),
  })
  .superRefine((value, context) => {
    if (new Set(value.approverUserIds).size !== value.approverUserIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Nao repita o mesmo aprovador financeiro.',
        path: ['approverUserIds'],
      });
    }
    if (value.approverUserIds.length < value.requiredApprovals) {
      context.addIssue({
        code: 'custom',
        message: 'A regra precisa ter aprovadores suficientes para o quorum.',
        path: ['approverUserIds'],
      });
    }
  });

export const createPaymentApprovalRuleInputSchema = paymentRuleFieldsSchema;
export type CreatePaymentApprovalRuleInput = z.infer<
  typeof createPaymentApprovalRuleInputSchema
>;

export const updatePaymentApprovalRuleInputSchema = paymentRuleFieldsSchema.and(
  z.object({ expectedUpdatedAt: z.string().datetime() }),
);
export type UpdatePaymentApprovalRuleInput = z.infer<
  typeof updatePaymentApprovalRuleInputSchema
>;

export const paymentApprovalRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  minimumAmount: monetaryValueSchema,
  requiredApprovals: z.number().int().min(1).max(2),
  notificationChannel: notificationChannelSchema,
  active: z.boolean(),
  approvers: z.array(
    z.object({
      userId: z.string().uuid(),
      name: z.string(),
      email: z.string().email(),
      phone: z.string().nullable(),
    }),
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PaymentApprovalRule = z.infer<typeof paymentApprovalRuleSchema>;

export const paymentInstructionInputSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    paymentChannel: paymentChannelSchema,
    paymentReference: nullableText(500).optional().default(null),
    pixKeyType: pixKeyTypeSchema.nullable().optional().default(null),
    pixKey: nullableText(160).optional().default(null),
    beneficiaryName: nullableText(160).optional().default(null),
    beneficiaryDocument: nullableText(18).optional().default(null),
    pixCopyPaste: nullableText(1_000).optional().default(null),
    notes: nullableText(500).optional().default(null),
  })
  .superRefine((value, context) => {
    if (value.paymentChannel !== 'PIX') return;
    if (!value.pixKey && !value.pixCopyPaste) {
      context.addIssue({
        code: 'custom',
        message: 'Informe uma chave Pix ou um codigo Pix copia e cola.',
        path: ['pixCopyPaste'],
      });
    }
    if ((value.pixKeyType === null) !== (value.pixKey === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o tipo e a chave Pix em conjunto.',
        path: ['pixKey'],
      });
    }
  });
export type PaymentInstructionInput = z.infer<
  typeof paymentInstructionInputSchema
>;

export const paymentInstructionSnapshotSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  paymentChannel: paymentChannelSchema,
  paymentReference: z.string().nullable(),
  pixKeyType: pixKeyTypeSchema.nullable(),
  pixKey: z.string().nullable(),
  beneficiaryName: z.string().nullable(),
  beneficiaryDocument: z.string().nullable(),
  pixCopyPaste: z.string().nullable(),
  hasPixQrImage: z.boolean(),
  notes: z.string().nullable(),
  validationWarnings: z.array(z.string()),
  fingerprint: z.string(),
  createdAt: z.string().datetime(),
});
export type PaymentInstructionSnapshot = z.infer<
  typeof paymentInstructionSnapshotSchema
>;

export const attachPixQrInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
});
export type AttachPixQrInput = z.infer<typeof attachPixQrInputSchema>;

export const requestAdvancePaymentInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  reason: z.string().trim().min(15).max(500),
});
export type RequestAdvancePaymentInput = z.infer<
  typeof requestAdvancePaymentInputSchema
>;

export const submitPaymentApprovalInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  installmentIds: z.array(z.string().uuid()).min(1).max(120),
});
export type SubmitPaymentApprovalInput = z.infer<
  typeof submitPaymentApprovalInputSchema
>;

export const recordPaymentApprovalDecisionInputSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    comment: nullableText(500),
  })
  .superRefine((value, context) => {
    if (value.decision === 'REJECTED' && !value.comment) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o motivo da reprovacao financeira.',
        path: ['comment'],
      });
    }
  });
export type RecordPaymentApprovalDecisionInput = z.infer<
  typeof recordPaymentApprovalDecisionInputSchema
>;

export const paymentApprovalTaskSchema = z.object({
  requestId: z.string().uuid(),
  purchaseId: z.string().uuid(),
  purchaseNumber: z.string(),
  supplierName: z.string(),
  mode: paymentApprovalModeSchema,
  ruleName: z.string(),
  amount: monetaryValueSchema,
  requiredApprovals: z.number().int().positive(),
  approvedCount: z.number().int().nonnegative(),
  submittedByName: z.string(),
  submittedAt: z.string().datetime(),
  titles: z.array(
    z.object({
      installmentId: z.string().uuid(),
      sequence: z.number().int().positive(),
      dueDate: isoDateSchema,
      amount: monetaryValueSchema,
      instructionFingerprint: z.string().length(64),
    }),
  ),
});
export type PaymentApprovalTask = z.infer<typeof paymentApprovalTaskSchema>;
export const paymentApprovalRequestSchema = paymentApprovalTaskSchema;
export type PaymentApprovalRequest = PaymentApprovalTask;

export const paymentSettlementInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  paidAt: isoDateSchema,
  amount: z.coerce.number().finite().positive().max(999_999_999_999.99),
  transactionId: z.string().trim().min(2).max(160),
});
export type PaymentSettlementInput = z.infer<
  typeof paymentSettlementInputSchema
>;

export const paymentSettlementSchema = z.object({
  id: z.string().uuid(),
  amount: monetaryValueSchema,
  paidAt: isoDateSchema,
  transactionId: z.string(),
  proofFileName: z.string(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
});
export type PaymentSettlement = z.infer<typeof paymentSettlementSchema>;

export const payableKanbanFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  stage: paymentWorkflowStageSchema.optional(),
  supplierId: z.string().uuid().optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});
export type PayableKanbanFilters = z.infer<typeof payableKanbanFiltersSchema>;

export const payableKanbanCardSchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  purchaseNumber: z.string(),
  purchaseUpdatedAt: z.string().datetime(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  sequence: z.number().int().positive(),
  dueDate: isoDateSchema,
  amount: monetaryValueSchema,
  paidAmount: monetaryValueSchema,
  balance: monetaryValueSchema,
  stage: paymentWorkflowStageSchema,
  overdue: z.boolean(),
  invoiceNumbers: z.array(z.string()),
  received: z.boolean(),
  advancePayment: z.boolean(),
  advanceReason: z.string().nullable(),
  hasAdvanceEvidence: z.boolean(),
  instruction: paymentInstructionSnapshotSchema.nullable(),
  settlements: z.array(paymentSettlementSchema),
  approval: z
    .object({
      requestId: z.string().uuid(),
      status: paymentApprovalStatusSchema,
      approvedCount: z.number().int().nonnegative(),
      requiredApprovals: z.number().int().positive(),
    })
    .nullable(),
  updatedAt: z.string().datetime(),
});
export type PayableKanbanCard = z.infer<typeof payableKanbanCardSchema>;

export const receiptFiscalItemOptionSchema = z.object({
  id: z.string().uuid(),
  invoiceDocumentId: z.string().uuid(),
  invoiceNumber: z.string().nullable(),
  purchaseItemId: z.string().uuid(),
  description: z.string(),
  quantity: z.number().positive(),
  receivedQuantity: z.number().nonnegative(),
  remainingQuantity: z.number().nonnegative(),
});
export type ReceiptFiscalItemOption = z.infer<
  typeof receiptFiscalItemOptionSchema
>;

export const receiptItemInputSchema = z.object({
  purchaseItemId: z.string().uuid(),
  invoiceDocumentItemId: z.string().uuid().nullable().optional().default(null),
  quantity: z.number().finite().positive().max(1_000_000),
});

export const createGoodsReceiptInputSchema = z.object({
  expectedPurchaseUpdatedAt: z.string().datetime(),
  receivedAt: isoDateSchema,
  notes: nullableText(1_000),
  items: z.array(receiptItemInputSchema).min(1).max(500),
});
export type CreateGoodsReceiptInput = z.infer<
  typeof createGoodsReceiptInputSchema
>;

export const goodsReceiptSchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  status: receiptStatusSchema,
  receivedAt: isoDateSchema,
  confirmedById: z.string().uuid(),
  confirmedByName: z.string(),
  notes: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      purchaseItemId: z.string().uuid(),
      description: z.string(),
      quantity: z.number().positive(),
    }),
  ),
  createdAt: z.string().datetime(),
});
export type GoodsReceipt = z.infer<typeof goodsReceiptSchema>;

export const receiptResponsibilityInputSchema = z.object({
  userId: z.string().uuid(),
  costCenterId: z.string().uuid().nullable().optional().default(null),
});
export type ReceiptResponsibilityInput = z.infer<
  typeof receiptResponsibilityInputSchema
>;

export const receiptResponsibilitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string(),
  costCenterId: z.string().uuid().nullable(),
  costCenterName: z.string().nullable(),
});
export type ReceiptResponsibility = z.infer<
  typeof receiptResponsibilitySchema
>;

export const fiscalIntegrationSchema = z.object({
  configured: z.boolean(),
  rolloutMode: z.enum(['SHADOW', 'EXACT_MATCH', 'AUTO_SCIENCE']),
  environment: fiscalEnvironmentSchema,
  taxpayerDocument: z.string().nullable(),
  certificateFingerprint: z.string().nullable(),
  certificateExpiresAt: z.string().datetime().nullable(),
  status: fiscalIntegrationStatusSchema,
  manifestationMode: recipientManifestationModeSchema,
  lastNsu: z.string(),
  maxNsu: z.string(),
  lastSyncedAt: z.string().datetime().nullable(),
  nextPollAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export type FiscalIntegration = z.infer<typeof fiscalIntegrationSchema>;

export const configureFiscalIntegrationMetadataSchema = z.object({
  expectedUpdatedAt: z
    .preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().datetime().nullable(),
    )
    .default(null),
  environment: fiscalEnvironmentSchema,
  taxpayerDocument: organizationDocumentSchema,
  manifestationMode: recipientManifestationModeSchema,
  certificatePassphrase: z.string().min(1).max(300),
});
export type ConfigureFiscalIntegrationMetadata = z.infer<
  typeof configureFiscalIntegrationMetadataSchema
>;

export const fiscalIntegrationVersionQuerySchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
});
export type FiscalIntegrationVersionQuery = z.infer<
  typeof fiscalIntegrationVersionQuerySchema
>;

export const fiscalSyncResultSchema = z.object({
  fetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  duplicated: z.number().int().nonnegative(),
  reviewRequired: z.number().int().nonnegative(),
  lastNsu: z.string(),
  maxNsu: z.string(),
});
export type FiscalSyncResult = z.infer<typeof fiscalSyncResultSchema>;

export const fiscalDocumentMatchSchema = z.object({
  id: z.string().uuid(),
  invoiceDocumentId: z.string().uuid(),
  purchaseId: z.string().uuid(),
  purchaseNumber: z.string(),
  status: fiscalMatchStatusSchema,
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type FiscalDocumentMatch = z.infer<typeof fiscalDocumentMatchSchema>;

export const fiscalDocumentSummarySchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().nullable(),
  accessKey: z.string().nullable(),
  source: z.enum(['UPLOAD', 'SEFAZ']),
  fiscalModel: z.string().nullable(),
  issuerDocument: z.string().nullable(),
  recipientDocument: z.string().nullable(),
  issuedAt: z.string().datetime().nullable(),
  total: monetaryValueSchema.nullable(),
  matchStatus: fiscalMatchStatusSchema,
  manifestation: recipientManifestationSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  matches: z.array(fiscalDocumentMatchSchema),
});
export type FiscalDocumentSummary = z.infer<typeof fiscalDocumentSummarySchema>;

export const fiscalDocumentFiltersSchema = z.object({
  search: z.string().trim().max(160).optional(),
  matchStatus: fiscalMatchStatusSchema.optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});
export type FiscalDocumentFilters = z.infer<typeof fiscalDocumentFiltersSchema>;

export const reviewFiscalDocumentMatchInputSchema = z
  .object({
    purchaseId: z.string().uuid().nullable(),
    decision: z.enum(['MATCH', 'REJECT']),
    reason: nullableText(500),
    expectedDocumentUpdatedAt: z.string().datetime(),
    expectedPurchaseUpdatedAt: z.string().datetime().nullable(),
  })
  .superRefine((value, context) => {
    if (value.decision === 'MATCH' && !value.purchaseId) {
      context.addIssue({
        code: 'custom',
        message: 'Selecione o pedido que sera vinculado.',
        path: ['purchaseId'],
      });
    }
    if (value.decision === 'MATCH' && !value.expectedPurchaseUpdatedAt) {
      context.addIssue({
        code: 'custom',
        message: 'Informe a versao atual do pedido.',
        path: ['expectedPurchaseUpdatedAt'],
      });
    }
    if (value.decision === 'MATCH' && (value.reason?.length ?? 0) < 3) {
      context.addIssue({
        code: 'custom',
        message: 'Registre a justificativa da conciliacao manual.',
        path: ['reason'],
      });
    }
    if (value.decision === 'REJECT' && !value.reason) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o motivo da rejeicao do vinculo.',
        path: ['reason'],
      });
    }
  });
export type ReviewFiscalDocumentMatchInput = z.infer<
  typeof reviewFiscalDocumentMatchInputSchema
>;

export const manifestFiscalDocumentInputSchema = z.object({
  manifestation: recipientManifestationSchema,
  reason: nullableText(500),
  expectedDocumentUpdatedAt: z.string().datetime(),
});
export type ManifestFiscalDocumentInput = z.infer<
  typeof manifestFiscalDocumentInputSchema
>;
