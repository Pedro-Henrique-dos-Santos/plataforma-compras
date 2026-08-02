import { describe, expect, it, vi } from 'vitest';

import { NotificationWorkerService } from './notification-worker.service.js';

describe('NotificationWorkerService', () => {
  it('claims and marks a delivered outbox event as sent', async () => {
    const fixture = workerFixture();
    fixture.dispatch.mockResolvedValue('provider-message-1');

    await fixture.worker.processBatch();

    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
    expect(fixture.rootUpdate).toHaveBeenCalledWith({
      where: { id: fixture.notification.id },
      data: expect.objectContaining({
        lastError: null,
        providerMessageId: 'provider-message-1',
        status: 'SENT',
      }),
    });
  });

  it('redacts credentials and schedules a retry when delivery fails', async () => {
    const fixture = workerFixture();
    fixture.dispatch.mockRejectedValue(
      new Error('Bearer secret-token refused by provider'),
    );

    await fixture.worker.processBatch();

    expect(fixture.rootUpdate).toHaveBeenCalledWith({
      where: { id: fixture.notification.id },
      data: expect.objectContaining({
        lastError: 'Bearer [redacted] refused by provider',
        status: 'FAILED',
      }),
    });
    const update = fixture.rootUpdate.mock.calls[0]?.[0];
    expect(update?.data.availableAt).toBeInstanceOf(Date);
  });
});

function workerFixture() {
  const notification = {
    id: '91000000-0000-4000-8000-000000000001',
    organizationId: '10000000-0000-4000-8000-000000000001',
    deduplicationKey: 'approval:1',
    eventType: 'PURCHASE_APPROVAL_REQUESTED',
    channel: 'EMAIL',
    recipient: 'approver@example.com',
    subject: 'Compra aguardando aprovacao',
    payload: { purchaseNumber: 'PED-001' },
    status: 'PENDING',
    attempts: 0,
    availableAt: new Date('2026-07-23T12:00:00.000Z'),
    sentAt: null,
    lastError: null,
    providerMessageId: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
  } as const;
  const claimed = { ...notification, attempts: 1, status: 'PROCESSING' as const };
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(notification)
    .mockResolvedValueOnce(null);
  const transactionOutbox = {
    findFirst,
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn().mockResolvedValue(claimed),
  };
  const rootUpdate = vi.fn().mockResolvedValue(claimed);
  const prisma = {
    $transaction: vi.fn(
      async (
        callback: (transaction: {
          notificationOutbox: typeof transactionOutbox;
        }) => unknown,
      ) => callback({ notificationOutbox: transactionOutbox }),
    ),
    notificationOutbox: {
      update: rootUpdate,
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const config = {
    get: vi.fn((_key: string, fallback?: string) => fallback),
  };
  const dispatch = vi.fn();
  const worker = new NotificationWorkerService(
    config as never,
    { prisma } as never,
    { dispatch } as never,
  );
  return { dispatch, notification, rootUpdate, worker };
}
