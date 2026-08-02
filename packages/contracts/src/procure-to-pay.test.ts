import { describe, expect, it } from 'vitest';

import {
  configureFiscalIntegrationMetadataSchema,
  createGoodsReceiptInputSchema,
  createPaymentApprovalRuleInputSchema,
  fiscalIntegrationVersionQuerySchema,
  manifestFiscalDocumentInputSchema,
  paymentInstructionInputSchema,
  receiptFiscalItemOptionSchema,
  requestAdvancePaymentInputSchema,
  reviewFiscalDocumentMatchInputSchema,
} from './procure-to-pay.js';

const firstUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondUser = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('procure-to-pay contracts', () => {
  it('enforces distinct approvers and the configured quorum', () => {
    const rule = {
      active: true,
      approverUserIds: [firstUser, secondUser],
      minimumAmount: 5_000,
      name: 'Dupla aprovacao financeira',
      notificationChannel: 'EMAIL',
      requiredApprovals: 2,
    };
    expect(createPaymentApprovalRuleInputSchema.safeParse(rule).success).toBe(true);
    expect(
      createPaymentApprovalRuleInputSchema.safeParse({
        ...rule,
        approverUserIds: [firstUser, firstUser],
      }).success,
    ).toBe(false);
  });

  it('requires a complete Pix instruction and an advance justification', () => {
    expect(
      paymentInstructionInputSchema.safeParse({
        expectedUpdatedAt: '2026-08-01T12:00:00.000Z',
        paymentChannel: 'PIX',
      }).success,
    ).toBe(false);
    expect(
      requestAdvancePaymentInputSchema.safeParse({
        expectedUpdatedAt: '2026-08-01T12:00:00.000Z',
        reason: 'curto',
      }).success,
    ).toBe(false);
  });

  it('rejects empty or nonpositive goods receipts', () => {
    expect(
      createGoodsReceiptInputSchema.safeParse({
        expectedPurchaseUpdatedAt: '2026-08-01T12:00:00.000Z',
        receivedAt: '2026-08-01',
        notes: null,
        items: [],
      }).success,
    ).toBe(false);
    expect(
      createGoodsReceiptInputSchema.safeParse({
        expectedPurchaseUpdatedAt: '2026-08-01T12:00:00.000Z',
        receivedAt: '2026-08-01',
        notes: null,
        items: [{ purchaseItemId: firstUser, quantity: 0 }],
      }).success,
    ).toBe(false);
  });

  it('validates fiscal receipt balances and records a manual match reason', () => {
    expect(
      receiptFiscalItemOptionSchema.safeParse({
        id: firstUser,
        invoiceDocumentId: secondUser,
        invoiceNumber: '1874',
        purchaseItemId: firstUser,
        description: 'Material hospitalar',
        quantity: 10,
        receivedQuantity: 4,
        remainingQuantity: 6,
      }).success,
    ).toBe(true);
    expect(
      reviewFiscalDocumentMatchInputSchema.safeParse({
        purchaseId: firstUser,
        decision: 'MATCH',
        reason: null,
        expectedDocumentUpdatedAt: '2026-08-01T12:00:00.000Z',
        expectedPurchaseUpdatedAt: '2026-08-01T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('requires resource versions for fiscal mutations', () => {
    const initialConfiguration = configureFiscalIntegrationMetadataSchema.parse({
      environment: 'HOMOLOGATION',
      taxpayerDocument: '11222333000181',
      manifestationMode: 'MANUAL',
      certificatePassphrase: 'senha-local',
    });
    expect(initialConfiguration.expectedUpdatedAt).toBeNull();
    expect(
      configureFiscalIntegrationMetadataSchema.safeParse({
        ...initialConfiguration,
        expectedUpdatedAt: '2026-08-01T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      fiscalIntegrationVersionQuerySchema.safeParse({ expectedUpdatedAt: '' }).success,
    ).toBe(false);
    expect(
      manifestFiscalDocumentInputSchema.safeParse({
        manifestation: 'AWARENESS',
        reason: null,
      }).success,
    ).toBe(false);
  });
});
