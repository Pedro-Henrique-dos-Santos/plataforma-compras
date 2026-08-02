import { describe, expect, it } from 'vitest';

import {
  purchaseAuditEventSchema,
  purchaseAuditFiltersSchema,
} from './audit.js';

describe('purchase audit contracts', () => {
  it('normalizes pagination and validates a chronological period', () => {
    expect(purchaseAuditFiltersSchema.parse({ page: '2', pageSize: '25' })).toMatchObject({
      page: 2,
      pageSize: 25,
    });
    expect(
      purchaseAuditFiltersSchema.safeParse({
        dateFrom: '2026-08-10',
        dateTo: '2026-08-01',
      }).success,
    ).toBe(false);
    expect(
      purchaseAuditFiltersSchema.safeParse({ eventType: 'organization_membership' }).success,
    ).toBe(false);
  });

  it('accepts an attributed purchase stage change', () => {
    expect(
      purchaseAuditEventSchema.parse({
        id: '10000000-0000-4000-8000-000000000001',
        action: 'UPDATE',
        eventType: 'purchase_workflow_stage',
        eventLabel: 'Etapa do pedido alterada',
        purchaseId: '20000000-0000-4000-8000-000000000001',
        purchaseDisplayNumber: 27,
        purchaseNumber: 'PED-27',
        actorUserId: '30000000-0000-4000-8000-000000000001',
        actorName: 'Pedro Henrique',
        reason: null,
        changes: [
          {
            field: 'workflowStage',
            before: 'AWAITING_APPROVAL',
            after: 'PURCHASE_ORDER',
          },
        ],
        createdAt: '2026-08-02T18:00:00.000Z',
      }).actorName,
    ).toBe('Pedro Henrique');
  });
});
