import { describe, expect, it } from 'vitest';

import { titleIsMatched, type ReconciliationTitle } from './payment-reconciliation.js';

function title(input: {
  fiscalDocumentId?: string | null;
  fiscalQuantity?: number;
  fiscalReceived?: number;
  fiscalItemMatched?: boolean;
  fiscalDocumentRequired?: boolean;
  linkStatus?: string;
  purchaseReceived?: number;
} = {}): ReconciliationTitle {
  const fiscalDocumentId = input.fiscalDocumentId === undefined ? 'invoice-a' : input.fiscalDocumentId;
  return {
    fiscalDocumentId,
    fiscalDocument: fiscalDocumentId
      ? {
          fiscalItems: [
            {
              matchedPurchaseItemId: input.fiscalItemMatched === false ? null : 'item-a',
              quantity: input.fiscalQuantity ?? 4,
              receiptItems: input.fiscalReceived
                ? [{ quantity: input.fiscalReceived, receipt: { status: 'CONFIRMED' } }]
                : [],
            },
          ],
        }
      : null,
    purchase: {
      fiscalDocumentRequired: input.fiscalDocumentRequired ?? true,
      fiscalDocumentLinks: [
        {
          invoiceDocumentId: 'invoice-a',
          matchStatus: input.linkStatus ?? 'MATCHED_EXACT',
        },
        { invoiceDocumentId: 'invoice-b', matchStatus: 'MATCHED_EXACT' },
      ],
      items: [
        {
          quantity: 10,
          receiptItems: input.purchaseReceived
            ? [{ quantity: input.purchaseReceived, receipt: { status: 'CONFIRMED' } }]
            : [],
        },
      ],
    },
  };
}

describe('payment title reconciliation', () => {
  it('releases the title for the received NF-e without requiring the entire purchase', () => {
    expect(titleIsMatched(title({ fiscalReceived: 4, purchaseReceived: 4 }))).toBe(true);
  });

  it('keeps a title blocked while its own NF-e is only partially received', () => {
    expect(titleIsMatched(title({ fiscalReceived: 3, purchaseReceived: 9 }))).toBe(false);
  });

  it('rejects an unlinked or unmatched fiscal item', () => {
    expect(titleIsMatched(title({ fiscalReceived: 4, linkStatus: 'REVIEW_REQUIRED' }))).toBe(false);
    expect(titleIsMatched(title({ fiscalItemMatched: false, fiscalReceived: 4 }))).toBe(false);
  });

  it('uses complete purchase receipt only for a legacy title without a fiscal document', () => {
    expect(titleIsMatched(title({ fiscalDocumentId: null, purchaseReceived: 10 }))).toBe(true);
    expect(titleIsMatched(title({ fiscalDocumentId: null, purchaseReceived: 9 }))).toBe(false);
  });

  it('keeps migrated documents without fiscal lines compatible after full receipt', () => {
    const migrated = title({ purchaseReceived: 10 });
    migrated.fiscalDocument!.fiscalItems = [];
    expect(titleIsMatched(migrated)).toBe(true);
  });

  it('reconciles an explicitly exempt purchase after full physical receipt', () => {
    expect(
      titleIsMatched(
        title({
          fiscalDocumentId: null,
          fiscalDocumentRequired: false,
          linkStatus: 'REVIEW_REQUIRED',
          purchaseReceived: 10,
        }),
      ),
    ).toBe(true);
    expect(
      titleIsMatched(
        title({
          fiscalDocumentId: null,
          fiscalDocumentRequired: false,
          purchaseReceived: 9,
        }),
      ),
    ).toBe(false);
  });
});
