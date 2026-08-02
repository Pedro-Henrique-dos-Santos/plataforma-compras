import { describe, expect, it } from 'vitest';

import {
  exactItemMatches,
  hasPurchaseReference,
  type ExactFiscalPurchase,
} from './fiscal-matching.js';

describe('exact fiscal matching', () => {
  it('matches a second NF-e only against the remaining purchase quantity', () => {
    const purchase = purchaseWithInvoicedQuantity(4);
    const secondInvoice = [
      {
        description: 'Luva de procedimento',
        quantity: 6,
        sequence: 1,
        total: 300,
        unitPrice: 50,
      },
    ];

    expect(exactItemMatches(purchase, secondInvoice, 300)).toEqual([
      { purchaseItemId: 'item-1', sequence: 1 },
    ]);
    expect(
      exactItemMatches(
        purchase,
        [{ ...secondInvoice[0]!, quantity: 7, total: 350 }],
        350,
      ),
    ).toBeNull();
  });

  it('requires unambiguous item and total matches', () => {
    const purchase = purchaseWithInvoicedQuantity(0);
    purchase.items.push({ ...purchase.items[0]!, id: 'item-2' });
    expect(
      exactItemMatches(
        purchase,
        [
          {
            description: 'Luva de procedimento',
            quantity: 1,
            sequence: 1,
            total: 50,
            unitPrice: 50,
          },
        ],
        50,
      ),
    ).toBeNull();
    expect(
      exactItemMatches(
        purchaseWithInvoicedQuantity(0),
        [
          {
            description: 'Luva de procedimento',
            quantity: 1,
            sequence: 1,
            total: 50,
            unitPrice: 50,
          },
        ],
        55,
      ),
    ).toBeNull();
  });

  it('accepts an embedded full order reference but not a short substring', () => {
    expect(
      hasPurchaseReference(
        { number: 'PED-2026-001', sourceReference: null },
        ['Pedido do cliente: PED-2026-001'],
      ),
    ).toBe(true);
    expect(
      hasPurchaseReference(
        { number: '1', sourceReference: null },
        ['Pedido do cliente: PED-2026-001'],
      ),
    ).toBe(false);
  });
});

function purchaseWithInvoicedQuantity(quantity: number): ExactFiscalPurchase {
  return {
    fiscalDocumentLinks: quantity
      ? [
          {
            invoiceDocument: {
              fiscalItems: [
                { matchedPurchaseItemId: 'item-1', quantity },
              ],
            },
          },
        ]
      : [],
    items: [
      {
        description: 'Luva de procedimento',
        id: 'item-1',
        negotiatedPrice: 50,
        quantity: 10,
        unitPrice: 55,
      },
    ],
  };
}
