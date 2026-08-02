import { z } from 'zod';

import {
  isoDateSchema,
  monetaryValueSchema,
  paymentChannelSchema,
} from './master-data.js';
import {
  purchaseApprovalDetailSchema,
  purchaseApprovalSummarySchema,
  purchaseStageHistorySchema,
  purchaseWorkflowStageSchema,
} from './workflow.js';

export const purchaseStatusSchema = z.enum(['DRAFT', 'REGISTERED', 'CANCELLED']);
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;

export const purchaseLifecycleStatusSchema = z.enum(['REGISTERED', 'CANCELLED']);
export type PurchaseLifecycleStatus = z.infer<typeof purchaseLifecycleStatusSchema>;

export const purchaseSourceSchema = z.enum(['MANUAL', 'CSV', 'INVOICE', 'GOOGLE_SHEETS']);
export type PurchaseSource = z.infer<typeof purchaseSourceSchema>;

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

export const purchaseAllocationInputSchema = z.object({
  costCenterId: z.string().uuid(),
  percentage: z.number().finite().positive().max(100),
});
export type PurchaseAllocationInput = z.infer<typeof purchaseAllocationInputSchema>;

export const purchaseItemInputSchema = z
  .object({
    description: z.string().trim().min(2).max(240),
    quantity: z.number().finite().positive().max(1_000_000).optional().default(1),
    unit: nullableText(30),
    unitPrice: monetaryValueSchema,
    negotiatedPrice: monetaryValueSchema.nullable().optional().default(null),
    costCenterId: z.string().uuid().nullable().optional().default(null),
    allocations: z.array(purchaseAllocationInputSchema).max(20).optional().default([]),
  })
  .superRefine((value, context) => {
    if (value.costCenterId && value.allocations.length) {
      context.addIssue({
        code: 'custom',
        message: 'Use um centro de custo direto ou um rateio, nao os dois.',
        path: ['allocations'],
      });
    }
    if (value.allocations.length) {
      const total = value.allocations.reduce((sum, allocation) => sum + allocation.percentage, 0);
      if (Math.abs(total - 100) > 0.01) {
        context.addIssue({
          code: 'custom',
          message: 'Os percentuais de rateio devem totalizar 100%.',
          path: ['allocations'],
        });
      }
      if (new Set(value.allocations.map((allocation) => allocation.costCenterId)).size !== value.allocations.length) {
        context.addIssue({
          code: 'custom',
          message: 'Nao repita o mesmo centro de custo no rateio.',
          path: ['allocations'],
        });
      }
    }
  });
export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;

export const installmentInputSchema = z.object({
  dueDate: isoDateSchema,
  amount: monetaryValueSchema.positive(),
  paymentChannel: paymentChannelSchema.nullable().optional(),
  paymentReference: nullableText(500).optional(),
  paymentNotes: nullableText(500).optional(),
});
export type InstallmentInput = z.infer<typeof installmentInputSchema>;

export const createPurchaseInputSchema = z
  .object({
    number: z.string().trim().min(1).max(40),
    invoiceNumber: nullableText(60).optional(),
    fiscalDocumentRequired: z.boolean().optional(),
    supplierId: z.string().uuid(),
    issuedAt: isoDateSchema,
    category: nullableText(100),
    operationNature: nullableText(100),
    paymentMethod: nullableText(80),
    notes: nullableText(2_000),
    source: purchaseSourceSchema.optional().default('MANUAL'),
    sourceReference: nullableText(120),
    workflowStage: purchaseWorkflowStageSchema.optional(),
    items: z.array(purchaseItemInputSchema).min(1).max(500),
    installments: z.array(installmentInputSchema).max(120).optional().default([]),
  })
  .superRefine(validateInstallmentTotal);
export type CreatePurchaseInput = z.infer<typeof createPurchaseInputSchema>;

export const updatePurchaseInputSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    number: z.string().trim().min(1).max(40),
    invoiceNumber: nullableText(60).optional(),
    fiscalDocumentRequired: z.boolean().optional(),
    supplierId: z.string().uuid(),
    issuedAt: isoDateSchema.nullable(),
    category: nullableText(100),
    operationNature: nullableText(100),
    paymentMethod: nullableText(80),
    notes: nullableText(2_000),
    items: z.array(purchaseItemInputSchema).min(1).max(500),
    installments: z.array(installmentInputSchema).max(120).optional().default([]),
  })
  .superRefine(validateInstallmentTotal);
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseInputSchema>;

export const changePurchaseStatusInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  status: purchaseLifecycleStatusSchema,
  reason: z.string().trim().min(3).max(500),
});
export type ChangePurchaseStatusInput = z.infer<typeof changePurchaseStatusInputSchema>;

export const purchaseSummarySchema = z.object({
  id: z.string().uuid(),
  displayNumber: z.number().int().positive(),
  number: z.string(),
  invoiceNumber: z.string().nullable(),
  fiscalDocumentRequired: z.boolean(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  issuedAt: isoDateSchema.nullable(),
  status: purchaseStatusSchema,
  category: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  total: monetaryValueSchema,
  negotiatedSavings: monetaryValueSchema,
  departments: z.array(z.string()),
  itemCount: z.number().int().nonnegative(),
  source: purchaseSourceSchema,
  sourceReference: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  workflowStage: purchaseWorkflowStageSchema,
  invoiceLinked: z.boolean(),
  approval: purchaseApprovalSummarySchema.nullable(),
});
export type PurchaseSummary = z.infer<typeof purchaseSummarySchema>;

export const purchaseAllocationDetailSchema = z.object({
  costCenterId: z.string().uuid(),
  costCenterName: z.string().trim().min(1).max(120),
  percentage: z.number().finite().positive().max(100),
  amount: monetaryValueSchema,
});
export type PurchaseAllocationDetail = z.infer<typeof purchaseAllocationDetailSchema>;

export const purchaseItemDetailSchema = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(2).max(240),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().max(30).nullable(),
  unitPrice: monetaryValueSchema,
  negotiatedPrice: monetaryValueSchema.nullable(),
  total: monetaryValueSchema,
  costCenterId: z.string().uuid().nullable(),
  costCenterName: z.string().trim().min(1).max(120).nullable(),
  allocations: z.array(purchaseAllocationDetailSchema),
});
export type PurchaseItemDetail = z.infer<typeof purchaseItemDetailSchema>;

export const purchaseInstallmentDetailSchema = z.object({
  sequence: z.number().int().positive(),
  dueDate: isoDateSchema,
  amount: monetaryValueSchema,
  paidAt: isoDateSchema.nullable(),
  paymentChannel: paymentChannelSchema.nullable(),
  paymentReference: z.string().max(500).nullable(),
  paymentNotes: z.string().max(500).nullable(),
});
export type PurchaseInstallmentDetail = z.infer<typeof purchaseInstallmentDetailSchema>;

export const purchaseFiscalDocumentSchema = z.object({
  id: z.string().uuid().nullable(),
  invoiceNumber: z.string().nullable(),
  accessKey: z.string().nullable(),
  issuerName: z.string().nullable(),
  issuerDocument: z.string().nullable(),
  issuedAt: z.string().datetime().nullable(),
  total: monetaryValueSchema.nullable(),
  kind: z.enum(['PDF', 'XML']).nullable(),
  matchStatus: z
    .enum(['UNMATCHED', 'MATCHED_EXACT', 'MATCHED_MANUAL', 'REVIEW_REQUIRED', 'REJECTED'])
    .nullable(),
  fileName: z.string().nullable(),
  fileAvailable: z.boolean(),
  legacy: z.boolean(),
});
export type PurchaseFiscalDocument = z.infer<typeof purchaseFiscalDocumentSchema>;

export const purchaseDetailSchema = purchaseSummarySchema.extend({
  operationNature: z.string().trim().max(100).nullable(),
  notes: z.string().max(2_000).nullable(),
  items: z.array(purchaseItemDetailSchema).min(1),
  installments: z.array(purchaseInstallmentDetailSchema),
  fiscalDocuments: z.array(purchaseFiscalDocumentSchema),
  approval: purchaseApprovalDetailSchema.nullable(),
  stageHistory: z.array(purchaseStageHistorySchema),
});
export type PurchaseDetail = z.infer<typeof purchaseDetailSchema>;

export const attachPurchaseInvoiceInputSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(60),
});
export type AttachPurchaseInvoiceInput = z.infer<typeof attachPurchaseInvoiceInputSchema>;

export const purchaseImportInputSchema = z.object({
  purchases: z.array(createPurchaseInputSchema).min(1).max(250),
});
export type PurchaseImportInput = z.infer<typeof purchaseImportInputSchema>;

export const purchaseImportResultSchema = z.object({
  total: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  duplicated: z.number().int().nonnegative(),
});
export type PurchaseImportResult = z.infer<typeof purchaseImportResultSchema>;

function validateInstallmentTotal(
  value: {
    installments: Array<{ amount: number }>;
    items: Array<{ negotiatedPrice: number | null; quantity: number; unitPrice: number }>;
  },
  context: z.RefinementCtx,
) {
  if (!value.installments.length) {
    return;
  }
  const purchaseTotal = value.items.reduce(
    (sum, item) => sum + item.quantity * (item.negotiatedPrice ?? item.unitPrice),
    0,
  );
  const installmentTotal = value.installments.reduce(
    (sum, installment) => sum + installment.amount,
    0,
  );
  if (Math.abs(purchaseTotal - installmentTotal) > 0.01) {
    context.addIssue({
      code: 'custom',
      message: 'A soma das parcelas deve ser igual ao total da compra.',
      path: ['installments'],
    });
  }
}
