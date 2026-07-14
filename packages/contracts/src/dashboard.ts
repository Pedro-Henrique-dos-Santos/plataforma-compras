import { z } from 'zod';

export const moneyMetricSchema = z.object({
  value: z.number().finite(),
  variation: z.number().finite().nullable(),
});

export const dashboardSummarySchema = z.object({
  periodLabel: z.string(),
  totalPurchased: moneyMetricSchema,
  negotiatedSavings: moneyMetricSchema,
  activeSuppliers: z.number().int().nonnegative(),
  registeredPurchases: z.number().int().nonnegative(),
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
  recentPurchases: z.array(
    z.object({
      id: z.string(),
      supplier: z.string(),
      date: z.string(),
      total: z.number().nonnegative(),
      costCenter: z.string(),
    }),
  ),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

