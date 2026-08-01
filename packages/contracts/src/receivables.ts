import { z } from 'zod';

import { isoDateSchema, monetaryValueSchema } from './master-data.js';
import { organizationDocumentSchema } from './organizations.js';

export const receivableStatusSchema = z.enum([
  'OPEN',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);
export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;

export const receivableSourceSchema = z.enum([
  'MANUAL',
  'INVOICE',
  'IMPORT',
  'SALE',
]);
export type ReceivableSource = z.infer<typeof receivableSourceSchema>;

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

const nullableDocument = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  organizationDocumentSchema.nullable(),
);

const nullableDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  isoDateSchema.nullable(),
);

const positiveMoneySchema = monetaryValueSchema.refine((value) => value > 0, {
  message: 'O valor deve ser maior que zero.',
});

export const receivableSettlementSchema = z.object({
  id: z.string().uuid(),
  amount: positiveMoneySchema,
  receivedAt: isoDateSchema,
  transactionId: z.string().trim().max(120).nullable(),
  notes: z.string().trim().max(500).nullable(),
  createdById: z.string().uuid(),
  createdByName: z.string().trim().min(2).max(120),
  createdAt: z.string().datetime(),
});
export type ReceivableSettlement = z.infer<typeof receivableSettlementSchema>;

export const receivableSchema = z.object({
  id: z.string().uuid(),
  customerName: z.string().trim().min(2).max(160),
  customerDocument: z.string().trim().max(18).nullable(),
  description: z.string().trim().min(2).max(240),
  category: z.string().trim().max(100).nullable(),
  documentNumber: z.string().trim().max(80).nullable(),
  invoiceNumber: z.string().trim().max(80).nullable(),
  issuedAt: isoDateSchema.nullable(),
  dueDate: isoDateSchema,
  expectedAt: isoDateSchema.nullable(),
  amount: positiveMoneySchema,
  receivedAmount: monetaryValueSchema,
  balance: monetaryValueSchema,
  status: receivableStatusSchema,
  overdue: z.boolean(),
  source: receivableSourceSchema,
  notes: z.string().trim().max(2_000).nullable(),
  settlements: z.array(receivableSettlementSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Receivable = z.infer<typeof receivableSchema>;

export const createReceivableInputSchema = z
  .object({
    customerName: z.string().trim().min(2).max(160),
    customerDocument: nullableDocument,
    description: z.string().trim().min(2).max(240),
    category: nullableText(100),
    documentNumber: nullableText(80),
    invoiceNumber: nullableText(80),
    issuedAt: nullableDate,
    dueDate: isoDateSchema,
    expectedAt: nullableDate,
    amount: positiveMoneySchema,
    source: receivableSourceSchema.optional().default('MANUAL'),
    notes: nullableText(2_000),
  })
  .refine(
    (value) => !value.issuedAt || value.dueDate >= value.issuedAt,
    { message: 'O vencimento deve ser igual ou posterior a emissao.', path: ['dueDate'] },
  );
export type CreateReceivableInput = z.infer<typeof createReceivableInputSchema>;

export const updateReceivableInputSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    customerName: z.string().trim().min(2).max(160).optional(),
    customerDocument: nullableDocument.optional(),
    description: z.string().trim().min(2).max(240).optional(),
    category: nullableText(100).optional(),
    documentNumber: nullableText(80).optional(),
    invoiceNumber: nullableText(80).optional(),
    issuedAt: nullableDate.optional(),
    dueDate: isoDateSchema.optional(),
    expectedAt: nullableDate.optional(),
    amount: positiveMoneySchema.optional(),
    source: receivableSourceSchema.optional(),
    notes: nullableText(2_000).optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
    { message: 'Informe ao menos um campo para alterar.' },
  );
export type UpdateReceivableInput = z.infer<typeof updateReceivableInputSchema>;

export const createReceivableSettlementInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  amount: positiveMoneySchema,
  receivedAt: isoDateSchema,
  transactionId: nullableText(120),
  notes: nullableText(500),
});
export type CreateReceivableSettlementInput = z.infer<
  typeof createReceivableSettlementInputSchema
>;

export const changeReceivableStatusInputSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  status: z.enum(['OPEN', 'CANCELLED']),
});
export type ChangeReceivableStatusInput = z.infer<
  typeof changeReceivableStatusInputSchema
>;

export const receivableFiltersSchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.enum([
    'OPEN',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
    'OVERDUE',
  ]).optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});
export type ReceivableFilters = z.infer<typeof receivableFiltersSchema>;

export const receivablesReportSchema = z.object({
  dataSource: z.enum(['DATABASE', 'DEMO']),
  generatedAt: z.string().datetime(),
  totals: z.object({
    open: monetaryValueSchema,
    overdue: monetaryValueSchema,
    dueIn30Days: monetaryValueSchema,
    received: monetaryValueSchema,
    rowCount: z.number().int().nonnegative(),
  }),
  rows: z.array(receivableSchema),
});
export type ReceivablesReport = z.infer<typeof receivablesReportSchema>;
