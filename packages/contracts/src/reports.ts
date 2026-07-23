import { z } from 'zod';

import { invoiceDocumentKindSchema, invoiceDocumentStatusSchema } from './invoices.js';
import { isoDateSchema, monetaryValueSchema } from './master-data.js';
import { purchaseSourceSchema, purchaseStatusSchema } from './purchases.js';

export const procurementReportFiltersSchema = z
  .object({
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    supplierId: z.string().uuid().optional(),
    costCenterId: z.string().uuid().optional(),
    category: z.string().trim().min(1).max(100).optional(),
    status: purchaseStatusSchema.optional().default('REGISTERED'),
  })
  .superRefine((value, context) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      context.addIssue({
        code: 'custom',
        message: 'A data inicial nao pode ser posterior a data final.',
        path: ['dateTo'],
      });
    }
  });
export type ProcurementReportFilters = z.infer<typeof procurementReportFiltersSchema>;

export const procurementReportBreakdownSchema = z.object({
  key: z.string(),
  label: z.string(),
  total: monetaryValueSchema,
  savings: monetaryValueSchema,
  purchaseCount: z.number().int().nonnegative(),
});
export type ProcurementReportBreakdown = z.infer<typeof procurementReportBreakdownSchema>;

export const procurementReportRowSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  invoiceNumber: z.string().nullable(),
  issuedAt: isoDateSchema.nullable(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  category: z.string().nullable(),
  departments: z.array(z.string()),
  source: purchaseSourceSchema,
  status: purchaseStatusSchema,
  itemCount: z.number().int().nonnegative(),
  total: monetaryValueSchema,
  negotiatedSavings: monetaryValueSchema,
});
export type ProcurementReportRow = z.infer<typeof procurementReportRowSchema>;

export const procurementReportSchema = z.object({
  dataSource: z.enum(['DEMO', 'DATABASE']),
  generatedAt: z.string().datetime(),
  period: z.object({
    dateFrom: isoDateSchema.nullable(),
    dateTo: isoDateSchema.nullable(),
    label: z.string(),
  }),
  totals: z.object({
    purchased: monetaryValueSchema,
    negotiatedSavings: monetaryValueSchema,
    savingsPercentage: z.number().finite().nonnegative(),
    averageTicket: monetaryValueSchema,
    purchaseCount: z.number().int().nonnegative(),
    supplierCount: z.number().int().nonnegative(),
  }),
  bySupplier: z.array(procurementReportBreakdownSchema),
  byCategory: z.array(procurementReportBreakdownSchema),
  byDepartment: z.array(procurementReportBreakdownSchema),
  byMonth: z.array(procurementReportBreakdownSchema),
  purchases: z.array(procurementReportRowSchema),
});
export type ProcurementReport = z.infer<typeof procurementReportSchema>;

const detailedCostCenterSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});

export const procurementDetailedSupplierSchema = z.object({
  id: z.string().uuid(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  document: z.string().nullable(),
  category: z.string().nullable(),
  operationNature: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  defaultCostCenter: detailedCostCenterSchema.nullable(),
});
export type ProcurementDetailedSupplier = z.infer<typeof procurementDetailedSupplierSchema>;

export const procurementDetailedAllocationSchema = z.object({
  costCenter: detailedCostCenterSchema,
  percentage: z.number().finite().nonnegative(),
  amount: monetaryValueSchema,
});
export type ProcurementDetailedAllocation = z.infer<typeof procurementDetailedAllocationSchema>;

export const procurementDetailedItemSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  quantity: z.number().finite().positive(),
  unit: z.string().nullable(),
  unitPrice: monetaryValueSchema,
  negotiatedPrice: monetaryValueSchema.nullable(),
  total: monetaryValueSchema,
  negotiatedSavings: monetaryValueSchema,
  costCenter: detailedCostCenterSchema.nullable(),
  allocations: z.array(procurementDetailedAllocationSchema),
});
export type ProcurementDetailedItem = z.infer<typeof procurementDetailedItemSchema>;

export const procurementDetailedInstallmentSchema = z.object({
  sequence: z.number().int().positive(),
  dueDate: isoDateSchema,
  amount: monetaryValueSchema,
  paidAt: isoDateSchema.nullable(),
});
export type ProcurementDetailedInstallment = z.infer<
  typeof procurementDetailedInstallmentSchema
>;

export const procurementDetailedInvoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().nullable(),
  accessKey: z.string().nullable(),
  fileName: z.string(),
  kind: invoiceDocumentKindSchema,
  status: invoiceDocumentStatusSchema,
  parser: z.string().nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  processedAt: z.string().datetime().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  importedAt: z.string().datetime().nullable(),
});
export type ProcurementDetailedInvoice = z.infer<typeof procurementDetailedInvoiceSchema>;

export const procurementDetailedPurchaseSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  invoiceNumber: z.string().nullable(),
  issuedAt: isoDateSchema.nullable(),
  status: purchaseStatusSchema,
  category: z.string().nullable(),
  operationNature: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  notes: z.string().nullable(),
  source: purchaseSourceSchema,
  sourceReference: z.string().nullable(),
  total: monetaryValueSchema,
  negotiatedSavings: monetaryValueSchema,
  createdAt: z.string().datetime(),
  supplier: procurementDetailedSupplierSchema,
  items: z.array(procurementDetailedItemSchema),
  installments: z.array(procurementDetailedInstallmentSchema),
  invoices: z.array(procurementDetailedInvoiceSchema),
});
export type ProcurementDetailedPurchase = z.infer<typeof procurementDetailedPurchaseSchema>;

export const procurementDetailedReportSchema = z.object({
  summary: procurementReportSchema,
  purchases: z.array(procurementDetailedPurchaseSchema),
});
export type ProcurementDetailedReport = z.infer<typeof procurementDetailedReportSchema>;
