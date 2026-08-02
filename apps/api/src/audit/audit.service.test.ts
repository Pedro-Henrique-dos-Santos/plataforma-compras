import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { AuditService } from './audit.service.js';

const organizationId = '10000000-0000-4000-8000-000000000001';
const purchaseId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const participantId = '40000000-0000-4000-8000-000000000001';
const actorId = '50000000-0000-4000-8000-000000000001';

describe('AuditService', () => {
  it('keeps tenant filtering and resolves an old approval decision to its purchase', async () => {
    const row = {
      id: '60000000-0000-4000-8000-000000000001',
      organizationId,
      actorUserId: actorId,
      action: 'UPDATE',
      resource: 'purchase_approval_decision',
      resourceId: participantId,
      requestId: null,
      ipAddress: null,
      metadata: { decision: 'APPROVED', requestId },
      createdAt: new Date('2026-08-02T18:00:00.000Z'),
      actor: { id: actorId, name: 'Pedro Henrique' },
    } as const;
    const auditFindMany = vi.fn(async () => [row]);
    const prisma = {
      auditLog: {
        count: vi.fn(async () => 1),
        findMany: auditFindMany,
      },
      purchase: {
        findMany: vi.fn(async () => [
          { id: purchaseId, displaySequence: 27, number: 'PED-27' },
        ]),
      },
      purchaseApprovalRequest: {
        findMany: vi.fn(async () => [{ id: requestId, purchaseId }]),
      },
      user: {
        findMany: vi.fn(async () => [{ id: actorId, name: 'Pedro Henrique' }]),
      },
    };
    const database = { enabled: true, prisma } as unknown as DatabaseService;
    const service = new AuditService(database);

    const result = await service.listPurchaseEvents(organizationId, {
      page: 1,
      pageSize: 50,
    });

    expect(auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId }),
      }),
    );
    expect(result.items[0]).toMatchObject({
      actorName: 'Pedro Henrique',
      eventLabel: 'Pedido aprovado',
      purchaseDisplayNumber: 27,
      purchaseId,
      changes: [{ field: 'decision', before: null, after: 'APPROVED' }],
    });
  });

  it('returns no unrelated records when the requested friendly number does not exist', async () => {
    const prisma = {
      purchase: { findFirst: vi.fn(async () => null) },
      user: { findMany: vi.fn(async () => []) },
    };
    const service = new AuditService({ enabled: true, prisma } as unknown as DatabaseService);

    const result = await service.listPurchaseEvents(organizationId, {
      page: 1,
      pageSize: 50,
      purchaseDisplayNumber: 999,
    });

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
