import { z } from 'zod';

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
  issuedAt: isoDateSchema,
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
