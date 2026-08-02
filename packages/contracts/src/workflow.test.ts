import { describe, expect, it } from 'vitest';

import {
  schedulePayableInputSchema,
  updatePayableInputSchema,
} from './payables.js';
import {
  createApprovalRuleInputSchema,
  recordApprovalDecisionInputSchema,
  updateApprovalSettingsInputSchema,
} from './workflow.js';

const firstApprover = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondApprover = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('purchase workflow contracts', () => {
  it('requires distinct approvers and enough people for the configured quorum', () => {
    const baseRule = {
      name: 'Dupla aprovacao',
      minimumAmount: 5_000,
      requiredApprovals: 2,
      notificationChannel: 'EMAIL',
      active: true,
    } as const;

    expect(
      createApprovalRuleInputSchema.safeParse({
        ...baseRule,
        approverUserIds: [firstApprover],
      }).success,
    ).toBe(false);
    expect(
      createApprovalRuleInputSchema.safeParse({
        ...baseRule,
        approverUserIds: [firstApprover, firstApprover],
      }).success,
    ).toBe(false);
    expect(
      createApprovalRuleInputSchema.safeParse({
        ...baseRule,
        approverUserIds: [firstApprover, secondApprover],
      }).success,
    ).toBe(true);
  });

  it('requires a reason when an approver rejects a purchase', () => {
    expect(
      recordApprovalDecisionInputSchema.safeParse({
        requestId: firstApprover,
        decision: 'REJECTED',
        comment: null,
      }).success,
    ).toBe(false);
    expect(
      recordApprovalDecisionInputSchema.safeParse({
        requestId: firstApprover,
        decision: 'REJECTED',
        comment: 'Valor acima do orcamento aprovado.',
      }).success,
    ).toBe(true);
  });

  it('validates finance notification destinations by channel', () => {
    expect(
      updateApprovalSettingsInputSchema.safeParse({
        financeChannel: 'EMAIL',
        financeRecipient: 'financeiro@example.com',
        notifyFinanceOnApproval: true,
      }).success,
    ).toBe(true);
    expect(
      updateApprovalSettingsInputSchema.safeParse({
        financeChannel: 'WHATSAPP',
        financeRecipient: '11999999999',
        notifyFinanceOnApproval: true,
      }).success,
    ).toBe(false);
    expect(
      updateApprovalSettingsInputSchema.safeParse({
        financeChannel: null,
        financeRecipient: null,
        notifyFinanceOnApproval: true,
      }).success,
    ).toBe(false);
    expect(
      updateApprovalSettingsInputSchema.safeParse({
        financeChannel: null,
        financeRecipient: null,
        notifyFinanceOnApproval: false,
      }).success,
    ).toBe(true);
  });

  it('requires an actual payable change', () => {
    expect(
      updatePayableInputSchema.safeParse({
        expectedUpdatedAt: '2026-07-23T12:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      updatePayableInputSchema.safeParse({
        expectedUpdatedAt: '2026-07-23T12:00:00.000Z',
        paidAt: '2026-07-23',
      }).success,
    ).toBe(true);
  });

  it('requires a due date when scheduling an unscheduled purchase', () => {
    expect(
      schedulePayableInputSchema.safeParse({
        expectedUpdatedAt: '2026-07-23T12:00:00.000Z',
        dueDate: '2026-08-23',
        paymentChannel: 'PIX',
        paymentReference: '11222333000181',
        paymentNotes: null,
      }).success,
    ).toBe(true);
    expect(
      schedulePayableInputSchema.safeParse({
        expectedUpdatedAt: '2026-07-23T12:00:00.000Z',
        paymentChannel: null,
        paymentReference: null,
        paymentNotes: null,
      }).success,
    ).toBe(false);
  });
});
