import { z } from 'zod';

import { isoDateSchema } from './master-data.js';

export const auditActionSchema = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'IMPORT',
  'EXPORT',
  'SWITCH_ORGANIZATION',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const purchaseAuditEventTypeSchema = z.enum([
  'purchase',
  'purchase_workflow_stage',
  'purchase_status',
  'purchase_approval',
  'purchase_approval_decision',
  'purchase_invoice',
]);
export type PurchaseAuditEventType = z.infer<typeof purchaseAuditEventTypeSchema>;

export const auditChangeSchema = z.object({
  field: z.string().trim().min(1).max(120),
  before: z.string().nullable(),
  after: z.string().nullable(),
});
export type AuditChange = z.infer<typeof auditChangeSchema>;

export const purchaseAuditEventSchema = z.object({
  id: z.string().uuid(),
  action: auditActionSchema,
  eventType: purchaseAuditEventTypeSchema,
  eventLabel: z.string().trim().min(1).max(160),
  purchaseId: z.string().uuid().nullable(),
  purchaseDisplayNumber: z.number().int().positive().nullable(),
  purchaseNumber: z.string().nullable(),
  actorUserId: z.string().uuid().nullable(),
  actorName: z.string().trim().min(1).max(160),
  reason: z.string().nullable(),
  changes: z.array(auditChangeSchema),
  createdAt: z.string().datetime(),
});
export type PurchaseAuditEvent = z.infer<typeof purchaseAuditEventSchema>;

export const auditActorOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
});
export type AuditActorOption = z.infer<typeof auditActorOptionSchema>;

export const auditEventTypeOptionSchema = z.object({
  value: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(160),
});
export type AuditEventTypeOption = z.infer<typeof auditEventTypeOptionSchema>;

const optionalPositiveInteger = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : Number(value)),
  z.number().int().positive().optional(),
);

export const purchaseAuditFiltersSchema = z
  .object({
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    actorUserId: z.string().uuid().optional(),
    action: auditActionSchema.optional(),
    eventType: purchaseAuditEventTypeSchema.optional(),
    purchaseDisplayNumber: optionalPositiveInteger,
    page: optionalPositiveInteger.default(1),
    pageSize: z.preprocess(
      (value) => (value === '' || value === undefined ? 50 : Number(value)),
      z.number().int().min(10).max(100),
    ),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'A data inicial deve ser anterior ou igual a data final.',
    path: ['dateTo'],
  });
export type PurchaseAuditFilters = z.infer<typeof purchaseAuditFiltersSchema>;

export const purchaseAuditPageSchema = z.object({
  items: z.array(purchaseAuditEventSchema),
  actors: z.array(auditActorOptionSchema),
  eventTypes: z.array(auditEventTypeOptionSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type PurchaseAuditPage = z.infer<typeof purchaseAuditPageSchema>;
