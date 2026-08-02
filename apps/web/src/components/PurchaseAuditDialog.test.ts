import type { PurchaseAuditEvent } from '@compras/contracts';
import { describe, expect, it } from 'vitest';

import { auditChangeSummary, purchaseAuditQuery } from './PurchaseAuditDialog';

describe('purchase audit dialog', () => {
  it('serializes only active filters', () => {
    expect(
      purchaseAuditQuery(
        {
          action: 'UPDATE',
          actorUserId: '',
          dateFrom: '2026-08-01',
          dateTo: '',
          eventType: 'purchase_workflow_stage',
          purchaseDisplayNumber: '27',
        },
        2,
      ),
    ).toBe(
      '/audit/purchases?page=2&pageSize=50&dateFrom=2026-08-01&action=UPDATE&eventType=purchase_workflow_stage&purchaseDisplayNumber=27',
    );
  });

  it('renders a readable workflow transition', () => {
    const event = {
      changes: [
        {
          field: 'workflowStage',
          before: 'AWAITING_APPROVAL',
          after: 'PURCHASE_ORDER',
        },
      ],
    } as PurchaseAuditEvent;

    expect(auditChangeSummary(event)).toBe(
      'Etapa: Aguardando aprovacao -> Pedido de compra',
    );
  });
});
