import { z } from 'zod';

import { isoDateSchema } from './master-data.js';

const booleanQuerySchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

export const dashboardFiltersSchema = z
  .object({
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    supplierId: z.string().uuid().optional(),
    costCenterId: z.string().uuid().optional(),
    category: z.string().trim().min(1).max(100).optional(),
    includeUndated: booleanQuerySchema.optional().default(true),
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
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export const moneyMetricSchema = z.object({
  value: z.number().finite(),
  variation: z.number().finite().nullable(),
});

export const dashboardSummarySchema = z.object({
  dataSource: z.enum(['DEMO', 'DATABASE']),
  periodLabel: z.string(),
  totalPurchased: moneyMetricSchema,
  negotiatedSavings: moneyMetricSchema,
  activeSuppliers: z.number().int().nonnegative(),
  registeredPurchases: z.number().int().nonnegative(),
  undatedPurchases: z.number().int().nonnegative(),
  monthlySpend: z.array(
    z.object({
      month: z.string(),
      value: z.number().nonnegative(),
    }),
  ),
  spendByCategory: z.array(
    z.object({
      category: z.string(),
      value: z.number().nonnegative(),
      color: z.string(),
    }),
  ),
  spendByDepartment: z.array(
    z.object({
      department: z.string(),
      value: z.number().nonnegative(),
      color: z.string(),
    }),
  ),
  recentPurchases: z.array(
    z.object({
      id: z.string(),
      supplier: z.string(),
      date: isoDateSchema.nullable(),
      total: z.number().nonnegative(),
      costCenter: z.string(),
    }),
  ),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

