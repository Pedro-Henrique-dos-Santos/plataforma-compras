import { z } from 'zod';

import { isoDateSchema, monetaryValueSchema } from './master-data.js';

export const purchaseStatusSchema = z.enum(['DRAFT', 'REGISTERED', 'CANCELLED']);
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;

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
});
export type InstallmentInput = z.infer<typeof installmentInputSchema>;

export const createPurchaseInputSchema = z
  .object({
    number: z.string().trim().min(1).max(40),
    invoiceNumber: nullableText(60).optional(),
    supplierId: z.string().uuid(),
    issuedAt: isoDateSchema,
    category: nullableText(100),
    operationNature: nullableText(100),
    paymentMethod: nullableText(80),
    notes: nullableText(2_000),
    source: purchaseSourceSchema.optional().default('MANUAL'),
    sourceReference: nullableText(120),
    items: z.array(purchaseItemInputSchema).min(1).max(500),
    installments: z.array(installmentInputSchema).max(120).optional().default([]),
  })
  .superRefine((value, context) => {
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
  });
export type CreatePurchaseInput = z.infer<typeof createPurchaseInputSchema>;

export const purchaseSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  invoiceNumber: z.string().nullable(),
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
});
export type PurchaseSummary = z.infer<typeof purchaseSummarySchema>;

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
