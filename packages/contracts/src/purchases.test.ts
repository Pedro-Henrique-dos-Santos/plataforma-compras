import { describe, expect, it } from 'vitest';

import { createPurchaseInputSchema } from './purchases.js';

const supplierId = '11111111-1111-4111-8111-111111111111';
const firstCenter = '22222222-2222-4222-8222-222222222222';
const secondCenter = '33333333-3333-4333-8333-333333333333';

describe('purchase contracts', () => {
  it('accepts a purchase with a valid department allocation', () => {
    const input = createPurchaseInputSchema.parse({
      number: 'PC-001',
      supplierId,
      issuedAt: '2026-07-14',
      items: [
        {
          description: 'Material hospitalar',
          quantity: 2,
          unitPrice: 50,
          allocations: [
            { costCenterId: firstCenter, percentage: 60 },
            { costCenterId: secondCenter, percentage: 40 },
          ],
        },
      ],
      installments: [{ dueDate: '2026-08-14', amount: 100 }],
    });

    expect(input.items[0]?.quantity).toBe(2);
    expect(input.source).toBe('MANUAL');
  });

  it('rejects allocations that do not total one hundred percent', () => {
    expect(() =>
      createPurchaseInputSchema.parse({
        number: 'PC-002',
        supplierId,
        issuedAt: '2026-07-14',
        items: [
          {
            description: 'Material hospitalar',
            unitPrice: 100,
            allocations: [{ costCenterId: firstCenter, percentage: 80 }],
          },
        ],
      }),
    ).toThrow(/100%/);
  });

  it('rejects installment totals different from the purchase total', () => {
    expect(() =>
      createPurchaseInputSchema.parse({
        number: 'PC-003',
        supplierId,
        issuedAt: '2026-07-14',
        items: [{ description: 'Servico', unitPrice: 100 }],
        installments: [{ dueDate: '2026-08-14', amount: 90 }],
      }),
    ).toThrow(/parcelas/);
  });
});
