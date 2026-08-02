import { describe, expect, it } from 'vitest';

import {
  createReceivableInputSchema,
  createReceivableSettlementInputSchema,
  receivableFiltersSchema,
} from './receivables.js';

describe('accounts receivable contracts', () => {
  it('normalizes optional fields and defaults manual creation', () => {
    const parsed = createReceivableInputSchema.parse({
      customerName: 'Cliente Exemplo',
      customerDocument: '',
      description: 'Mensalidade de servicos',
      category: '',
      documentNumber: '',
      invoiceNumber: '',
      issuedAt: '2026-08-01',
      dueDate: '2026-08-10',
      expectedAt: '',
      amount: 100,
      notes: '',
    });

    expect(parsed).toMatchObject({
      customerDocument: null,
      category: null,
      expectedAt: null,
      source: 'MANUAL',
    });
  });

  it('rejects invalid dates, zero values and malformed filters', () => {
    expect(
      createReceivableInputSchema.safeParse({
        customerName: 'Cliente Exemplo',
        customerDocument: null,
        description: 'Mensalidade de servicos',
        category: null,
        documentNumber: null,
        invoiceNumber: null,
        issuedAt: '2026-08-10',
        dueDate: '2026-08-01',
        expectedAt: null,
        amount: 0,
        notes: null,
      }).success,
    ).toBe(false);
    expect(receivableFiltersSchema.safeParse({ status: 'UNKNOWN' }).success).toBe(false);
  });

  it('requires a positive settlement and optimistic concurrency version', () => {
    expect(
      createReceivableSettlementInputSchema.safeParse({
        expectedUpdatedAt: '2026-08-01T12:00:00.000Z',
        amount: 10,
        receivedAt: '2026-08-01',
        transactionId: '',
        notes: '',
      }).success,
    ).toBe(true);
    expect(
      createReceivableSettlementInputSchema.safeParse({
        expectedUpdatedAt: 'invalid',
        amount: -1,
        receivedAt: '2026-08-01',
      }).success,
    ).toBe(false);
  });
});
