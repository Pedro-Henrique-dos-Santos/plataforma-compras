import { z } from 'zod';

import { monetaryValueSchema } from './master-data.js';

export const purchaseWorkflowStageSchema = z.enum([
  'REGISTRATION',
  'REQUESTED',
  'AWAITING_APPROVAL',
  'PURCHASE_ORDER',
  'SUPPLIER_INVOICED',
  'RECEIVED',
  'COMPLETED',
]);
export type PurchaseWorkflowStage = z.infer<typeof purchaseWorkflowStageSchema>;

export const purchaseWorkflowStages = purchaseWorkflowStageSchema.options;

export const approvalRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type ApprovalRequestStatus = z.infer<typeof approvalRequestStatusSchema>;

export const approvalDecisionStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
export type ApprovalDecisionStatus = z.infer<typeof approvalDecisionStatusSchema>;

export const notificationChannelSchema = z.enum(['EMAIL', 'WHATSAPP']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationDeliveryStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
]);
export type NotificationDeliveryStatus = z.infer<typeof notificationDeliveryStatusSchema>;

const optionalReasonSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().trim().min(3).max(500).nullable(),
);

export const changePurchaseWorkflowStageInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  stage: purchaseWorkflowStageSchema,
  reason: optionalReasonSchema.optional(),
});
export type ChangePurchaseWorkflowStageInput = z.infer<
  typeof changePurchaseWorkflowStageInputSchema
>;

export const submitPurchaseForApprovalInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
});
export type SubmitPurchaseForApprovalInput = z.infer<
  typeof submitPurchaseForApprovalInputSchema
>;

export const approvalRuleApproverSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  phone: z.string().trim().max(30).nullable(),
});
export type ApprovalRuleApprover = z.infer<typeof approvalRuleApproverSchema>;

const approvalRuleFieldsSchema = z
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
        message: 'Nao repita o mesmo aprovador na regra.',
        path: ['approverUserIds'],
      });
    }
    if (value.approverUserIds.length < value.requiredApprovals) {
      context.addIssue({
        code: 'custom',
        message: 'A regra precisa ter aprovadores suficientes para o quorum configurado.',
        path: ['approverUserIds'],
      });
    }
  });

export const createApprovalRuleInputSchema = approvalRuleFieldsSchema;
export type CreateApprovalRuleInput = z.infer<typeof createApprovalRuleInputSchema>;

export const updateApprovalRuleInputSchema = approvalRuleFieldsSchema.and(
  z.object({ expectedUpdatedAt: z.string().datetime() }),
);
export type UpdateApprovalRuleInput = z.infer<typeof updateApprovalRuleInputSchema>;

export const approvalRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  minimumAmount: monetaryValueSchema,
  requiredApprovals: z.number().int().min(1).max(2),
  notificationChannel: notificationChannelSchema,
  active: z.boolean(),
  approvers: z.array(approvalRuleApproverSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;

export const approvalSettingsSchema = z.object({
  financeChannel: notificationChannelSchema.nullable(),
  financeRecipient: z.string().max(255).nullable(),
  notifyFinanceOnApproval: z.boolean(),
  requireStageReturnReason: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
});
export type ApprovalSettings = z.infer<typeof approvalSettingsSchema>;

export const updateApprovalSettingsInputSchema = z
  .object({
    financeChannel: notificationChannelSchema.nullable(),
    financeRecipient: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().trim().max(255).nullable(),
    ),
    notifyFinanceOnApproval: z.boolean(),
    requireStageReturnReason: z.boolean().optional().default(false),
  })
  .superRefine((value, context) => {
    if ((value.financeChannel === null) !== (value.financeRecipient === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o canal e o destinatario financeiro em conjunto.',
        path: ['financeRecipient'],
      });
      return;
    }
    if (value.notifyFinanceOnApproval && value.financeChannel === null) {
      context.addIssue({
        code: 'custom',
        message: 'Configure o canal e o destinatario para ativar a notificacao financeira.',
        path: ['financeRecipient'],
      });
      return;
    }
    if (
      value.financeChannel === 'EMAIL' &&
      !z.string().email().safeParse(value.financeRecipient).success
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Informe um e-mail financeiro valido.',
        path: ['financeRecipient'],
      });
    }
    if (
      value.financeChannel === 'WHATSAPP' &&
      !/^\+[1-9]\d{9,14}$/.test(value.financeRecipient ?? '')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o WhatsApp no formato internacional, por exemplo +5511999999999.',
        path: ['financeRecipient'],
      });
    }
  });
export type UpdateApprovalSettingsInput = z.infer<
  typeof updateApprovalSettingsInputSchema
>;

export const purchaseApprovalParticipantSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  decision: approvalDecisionStatusSchema,
  comment: z.string().nullable(),
  decidedAt: z.string().datetime().nullable(),
});
export type PurchaseApprovalParticipant = z.infer<
  typeof purchaseApprovalParticipantSchema
>;

export const purchaseApprovalSummarySchema = z.object({
  requestId: z.string().uuid(),
  status: approvalRequestStatusSchema,
  ruleName: z.string(),
  requiredApprovals: z.number().int().min(1).max(2),
  approvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  approvedBy: z.array(
    z.object({
      userId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      decidedAt: z.string().datetime(),
    }),
  ),
  submittedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type PurchaseApprovalSummary = z.infer<typeof purchaseApprovalSummarySchema>;

export const purchaseApprovalDetailSchema = purchaseApprovalSummarySchema.extend({
  amountSnapshot: monetaryValueSchema,
  participants: z.array(purchaseApprovalParticipantSchema),
});
export type PurchaseApprovalDetail = z.infer<typeof purchaseApprovalDetailSchema>;

export const purchaseStageHistorySchema = z.object({
  id: z.string().uuid(),
  fromStage: purchaseWorkflowStageSchema.nullable(),
  toStage: purchaseWorkflowStageSchema,
  changedById: z.string().uuid().nullable(),
  changedByName: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PurchaseStageHistory = z.infer<typeof purchaseStageHistorySchema>;

export const recordApprovalDecisionInputSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    comment: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.string().trim().min(3).max(500).nullable(),
    ),
  })
  .superRefine((value, context) => {
    if (value.decision === 'REJECTED' && value.comment === null) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o motivo da reprovacao.',
        path: ['comment'],
      });
    }
  });
export type RecordApprovalDecisionInput = z.infer<
  typeof recordApprovalDecisionInputSchema
>;

export const approvalTaskSchema = z.object({
  requestId: z.string().uuid(),
  purchaseId: z.string().uuid(),
  purchaseNumber: z.string(),
  supplierName: z.string(),
  total: monetaryValueSchema,
  category: z.string().nullable(),
  submittedAt: z.string().datetime(),
  approvedCount: z.number().int().nonnegative(),
  requiredApprovals: z.number().int().min(1).max(2),
});
export type ApprovalTask = z.infer<typeof approvalTaskSchema>;
