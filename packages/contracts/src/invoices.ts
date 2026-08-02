import { z } from 'zod';

import { isoDateSchema, monetaryValueSchema } from './master-data.js';
import {
  normalizeBrazilianDocument,
  organizationDocumentSchema,
} from './organizations.js';
import { purchaseSummarySchema } from './purchases.js';

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

const nullableDocument = z.preprocess(
  (value) => {
    if (value === '' || value === undefined || value === null) return null;
    return typeof value === 'string' ? normalizeBrazilianDocument(value) : value;
  },
  organizationDocumentSchema.nullable(),
);

export function normalizeNfeAccessKey(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.length === 47 && compact.startsWith('NFE')
    ? compact.slice(3)
    : compact;
}

export const nfeAccessKeySchema = z
  .string()
  .trim()
  .transform(normalizeNfeAccessKey)
  .refine((value) => /^[A-Z0-9]{44}$/.test(value), 'Informe uma chave de acesso valida.');

const nullableAccessKey = z.preprocess(
  (value) => {
    if (value === '' || value === undefined || value === null) return null;
    return typeof value === 'string' ? normalizeNfeAccessKey(value) : value;
  },
  nfeAccessKeySchema.nullable(),
);

export const invoiceDocumentStatusSchema = z.enum([
  'PROCESSING',
  'REVIEW_REQUIRED',
  'READY',
  'OUT_OF_SCOPE',
  'IMPORTING',
  'IMPORTED',
  'FAILED',
]);
export type InvoiceDocumentStatus = z.infer<typeof invoiceDocumentStatusSchema>;

export const invoiceDocumentKindSchema = z.enum(['PDF', 'XML']);
export type InvoiceDocumentKind = z.infer<typeof invoiceDocumentKindSchema>;

export const invoiceTriageStatusSchema = z.enum([
  'IN_SCOPE',
  'REVIEW_REQUIRED',
  'OUT_OF_SCOPE',
]);
export type InvoiceTriageStatus = z.infer<typeof invoiceTriageStatusSchema>;

export const invoiceExtractionItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: z.string().trim().max(30).nullable(),
  unitPrice: monetaryValueSchema,
  total: monetaryValueSchema,
});
export type InvoiceExtractionItem = z.infer<typeof invoiceExtractionItemSchema>;

export const invoiceExtractionInstallmentSchema = z.object({
  dueDate: isoDateSchema,
  amount: monetaryValueSchema.positive(),
});
export type InvoiceExtractionInstallment = z.infer<
  typeof invoiceExtractionInstallmentSchema
>;

export const invoiceExtractionSchema = z.object({
  invoiceNumber: z.string().nullable(),
  accessKey: z.string().nullable(),
  issuedAt: isoDateSchema.nullable(),
  supplierName: z.string().nullable(),
  supplierDocument: z.string().nullable(),
  total: monetaryValueSchema.nullable(),
  category: z.string().nullable(),
  operationNature: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  items: z.array(invoiceExtractionItemSchema),
  installments: z.array(invoiceExtractionInstallmentSchema),
  triageStatus: invoiceTriageStatusSchema,
  triageReason: z.string().nullable(),
  confidence: z.number().finite().min(0).max(1),
});
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export const invoiceReviewItemSchema = z.object({
  description: z.string().trim().min(2).max(240),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: nullableText(30),
  unitPrice: monetaryValueSchema,
  negotiatedPrice: monetaryValueSchema.nullable().optional().default(null),
  costCenterId: z.string().uuid().nullable().optional().default(null),
});
export type InvoiceReviewItem = z.infer<typeof invoiceReviewItemSchema>;

export const invoiceReviewInputSchema = z
  .object({
    supplierId: z.string().uuid().nullable().optional().default(null),
    supplierName: z.string().trim().min(2).max(160),
    supplierDocument: nullableDocument,
    invoiceNumber: z.string().trim().min(1).max(60),
    accessKey: nullableAccessKey,
    issuedAt: isoDateSchema,
    total: monetaryValueSchema.positive(),
    category: nullableText(100),
    operationNature: nullableText(100),
    paymentMethod: nullableText(80),
    defaultCostCenterId: z.string().uuid().nullable().optional().default(null),
    items: z.array(invoiceReviewItemSchema).min(1).max(500),
    installments: z
      .array(invoiceExtractionInstallmentSchema)
      .max(120)
      .optional()
      .default([]),
    notes: nullableText(2_000),
  })
  .superRefine((value, context) => {
    const itemTotal = value.items.reduce(
      (sum, item) => sum + item.quantity * (item.negotiatedPrice ?? item.unitPrice),
      0,
    );
    if (Math.abs(itemTotal - value.total) > 0.05) {
      context.addIssue({
        code: 'custom',
        message: 'A soma dos itens deve ser igual ao total da nota.',
        path: ['items'],
      });
    }
    if (value.installments.length) {
      const installmentTotal = value.installments.reduce(
        (sum, installment) => sum + installment.amount,
        0,
      );
      if (Math.abs(installmentTotal - value.total) > 0.05) {
        context.addIssue({
          code: 'custom',
          message: 'A soma das parcelas deve ser igual ao total da nota.',
          path: ['installments'],
        });
      }
    }
  });
export type InvoiceReviewInput = z.infer<typeof invoiceReviewInputSchema>;

export const rejectInvoiceDocumentInputSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectInvoiceDocumentInput = z.infer<
  typeof rejectInvoiceDocumentInputSchema
>;

export const invoiceDocumentSummarySchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  kind: invoiceDocumentKindSchema,
  size: z.number().int().nonnegative(),
  status: invoiceDocumentStatusSchema,
  parser: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  invoiceNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  supplierDocument: z.string().nullable(),
  issuedAt: isoDateSchema.nullable(),
  total: monetaryValueSchema.nullable(),
  triageStatus: invoiceTriageStatusSchema.nullable(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  purchaseId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  importedAt: z.string().datetime().nullable(),
});
export type InvoiceDocumentSummary = z.infer<typeof invoiceDocumentSummarySchema>;

export const invoiceDocumentDetailSchema = invoiceDocumentSummarySchema.extend({
  extraction: invoiceExtractionSchema.nullable(),
  review: invoiceReviewInputSchema.nullable(),
});
export type InvoiceDocumentDetail = z.infer<typeof invoiceDocumentDetailSchema>;

export const invoiceImportActionSchema = z.enum([
  'CREATED',
  'ATTACHED_INVOICE',
  'LINKED_EXISTING',
]);
export type InvoiceImportAction = z.infer<typeof invoiceImportActionSchema>;

export const invoiceImportResultSchema = z.object({
  action: invoiceImportActionSchema,
  document: invoiceDocumentDetailSchema,
  purchase: purchaseSummarySchema,
  supplierCreated: z.boolean(),
});
export type InvoiceImportResult = z.infer<typeof invoiceImportResultSchema>;

export const invoiceUploadConstraints = {
  maximumPdfBytes: 10 * 1024 * 1024,
  maximumXmlBytes: 5 * 1024 * 1024,
  maximumPdfPages: 20,
} as const;
