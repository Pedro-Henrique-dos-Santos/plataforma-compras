import { z } from 'zod';

import { isoDateSchema, monetaryValueSchema, paymentChannelSchema } from './master-data.js';
import { purchaseWorkflowStageSchema } from './workflow.js';

export const payableStatusSchema = z.enum([
  'UNSCHEDULED',
  'PENDING',
  'OVERDUE',
  'PAID',
]);
export type PayableStatus = z.infer<typeof payableStatusSchema>;

export const accountsPayableFiltersSchema = z
  .object({
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    supplierId: z.string().uuid().optional(),
    status: payableStatusSchema.optional(),
    paymentChannel: paymentChannelSchema.optional(),
    workflowStage: purchaseWorkflowStageSchema.optional(),
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
export type AccountsPayableFilters = z.infer<typeof accountsPayableFiltersSchema>;

export const accountsPayableRowSchema = z.object({
  id: z.string(),
  purchaseId: z.string().uuid(),
  purchaseNumber: z.string(),
  purchaseUpdatedAt: z.string().datetime(),
  invoiceNumber: z.string().nullable(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  sequence: z.number().int().nonnegative(),
  dueDate: isoDateSchema.nullable(),
  amount: monetaryValueSchema,
  paidAt: isoDateSchema.nullable(),
  status: payableStatusSchema,
  paymentChannel: paymentChannelSchema.nullable(),
  paymentReference: z.string().nullable(),
  paymentNotes: z.string().nullable(),
  workflowStage: purchaseWorkflowStageSchema,
});
export type AccountsPayableRow = z.infer<typeof accountsPayableRowSchema>;

export const accountsPayableReportSchema = z.object({
  dataSource: z.enum(['DEMO', 'DATABASE']),
  generatedAt: z.string().datetime(),
  totals: z.object({
    open: monetaryValueSchema,
    overdue: monetaryValueSchema,
    dueIn7Days: monetaryValueSchema,
    dueIn15Days: monetaryValueSchema,
    dueIn30Days: monetaryValueSchema,
    paid: monetaryValueSchema,
    unscheduled: monetaryValueSchema,
    rowCount: z.number().int().nonnegative(),
  }),
  rows: z.array(accountsPayableRowSchema),
});
export type AccountsPayableReport = z.infer<typeof accountsPayableReportSchema>;

export const schedulePayableInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  dueDate: isoDateSchema,
  paymentChannel: paymentChannelSchema.nullable(),
  paymentReference: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().trim().min(1).max(500).nullable(),
  ),
  paymentNotes: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().trim().min(1).max(500).nullable(),
  ),
});
export type SchedulePayableInput = z.infer<typeof schedulePayableInputSchema>;

export const updatePayableInputSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    dueDate: isoDateSchema.optional(),
    paymentChannel: paymentChannelSchema.nullable().optional(),
    paymentReference: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().trim().min(1).max(500).nullable(),
    ).optional(),
    paymentNotes: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().trim().min(1).max(500).nullable(),
    ).optional(),
    paidAt: isoDateSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.dueDate !== undefined ||
      value.paymentChannel !== undefined ||
      value.paymentReference !== undefined ||
      value.paymentNotes !== undefined ||
      value.paidAt !== undefined,
    { message: 'Informe ao menos um dado da conta para alterar.' },
  );
export type UpdatePayableInput = z.infer<typeof updatePayableInputSchema>;
