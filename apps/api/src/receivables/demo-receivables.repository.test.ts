import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  DEMO_AUTH_USER_ID,
  DEMO_USER_ID,
  EXAMPLE_COMPANY_ID,
  HUMAN_CLINIC_ID,
} from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { DemoReceivablesRepository } from './demo-receivables.repository.js';

const actor: AuthenticatedIdentity = {
  id: DEMO_USER_ID,
  authUserId: DEMO_AUTH_USER_ID,
  email: 'owner@example.com',
  name: 'Owner',
  platformRoles: ['PLATFORM_OWNER'],
};

describe('DemoReceivablesRepository', () => {
  it('isolates companies and reconciles partial receipts into the balance', async () => {
    const repository = new DemoReceivablesRepository();
    const created = await repository.create(actor, HUMAN_CLINIC_ID, {
      customerName: 'Cliente de teste',
      customerDocument: null,
      description: 'Receita de homologacao',
      category: 'Servicos',
      documentNumber: 'CTR-001',
      invoiceNumber: null,
      issuedAt: '2026-08-01',
      dueDate: '2026-08-15',
      expectedAt: '2026-08-15',
      amount: 1_000,
      source: 'MANUAL',
      notes: null,
    });
    const partial = await repository.settle(actor, HUMAN_CLINIC_ID, created.id, {
      expectedUpdatedAt: created.updatedAt,
      amount: 400,
      receivedAt: '2026-08-10',
      transactionId: 'REC-001',
      notes: null,
    });

    expect(partial).toMatchObject({
      status: 'PARTIALLY_RECEIVED',
      receivedAmount: 400,
      balance: 600,
    });
    expect(
      (await repository.list(EXAMPLE_COMPANY_ID, {})).some(
        (row) => row.id === created.id,
      ),
    ).toBe(false);

    const received = await repository.settle(actor, HUMAN_CLINIC_ID, created.id, {
      expectedUpdatedAt: partial.updatedAt,
      amount: 600,
      receivedAt: '2026-08-11',
      transactionId: 'REC-002',
      notes: 'Liquidacao final.',
    });
    expect(received).toMatchObject({
      status: 'RECEIVED',
      receivedAmount: 1_000,
      balance: 0,
    });
  });

  it('rejects overpayments, duplicate references and stale edits', async () => {
    const repository = new DemoReceivablesRepository();
    const created = await repository.create(actor, HUMAN_CLINIC_ID, {
      customerName: 'Cliente de teste',
      customerDocument: null,
      description: 'Receita de homologacao',
      category: null,
      documentNumber: null,
      invoiceNumber: null,
      issuedAt: null,
      dueDate: '2026-08-15',
      expectedAt: null,
      amount: 100,
      source: 'MANUAL',
      notes: null,
    });
    await expect(
      repository.settle(actor, HUMAN_CLINIC_ID, created.id, {
        expectedUpdatedAt: created.updatedAt,
        amount: 101,
        receivedAt: '2026-08-10',
        transactionId: 'REC-DUP',
        notes: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const partial = await repository.settle(actor, HUMAN_CLINIC_ID, created.id, {
      expectedUpdatedAt: created.updatedAt,
      amount: 50,
      receivedAt: '2026-08-10',
      transactionId: 'REC-DUP',
      notes: null,
    });
    const second = await repository.create(actor, HUMAN_CLINIC_ID, {
      customerName: 'Outro cliente',
      customerDocument: null,
      description: 'Outra receita',
      category: null,
      documentNumber: null,
      invoiceNumber: null,
      issuedAt: null,
      dueDate: '2026-08-20',
      expectedAt: null,
      amount: 200,
      source: 'MANUAL',
      notes: null,
    });
    await expect(
      repository.settle(actor, HUMAN_CLINIC_ID, second.id, {
        expectedUpdatedAt: second.updatedAt,
        amount: 20,
        receivedAt: '2026-08-10',
        transactionId: 'REC-DUP',
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      repository.update(actor, HUMAN_CLINIC_ID, created.id, {
        expectedUpdatedAt: created.updatedAt,
        description: 'Alteracao atrasada',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      repository.changeStatus(actor, HUMAN_CLINIC_ID, created.id, {
        expectedUpdatedAt: partial.updatedAt,
        status: 'CANCELLED',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
