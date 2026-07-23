import { describe, expect, it } from 'vitest';

import { invoiceReviewInputSchema } from './invoices.js';

const validReview = {
  supplierId: null,
  supplierName: 'Fornecedor Exemplo Ltda',
  supplierDocument: '11222333000181',
  invoiceNumber: '1234',
  accessKey: null,
  issuedAt: '2026-07-14',
  total: 100,
  category: null,
  operationNature: null,
  paymentMethod: null,
  defaultCostCenterId: null,
  items: [
    {
      description: 'Material hospitalar',
      quantity: 2,
      unit: 'UN',
      unitPrice: 50,
      negotiatedPrice: null,
      costCenterId: null,
    },
  ],
  installments: [],
  notes: null,
};

describe('invoice review contract', () => {
  it('accepts a balanced reviewed invoice', () => {
    expect(invoiceReviewInputSchema.parse(validReview).total).toBe(100);
  });

  it('rejects an invalid supplier CNPJ', () => {
    const result = invoiceReviewInputSchema.safeParse({
      ...validReview,
      supplierDocument: '11111111000111',
    });
    expect(result.success).toBe(false);
  });

  it('rejects item totals that do not match the invoice', () => {
    const result = invoiceReviewInputSchema.safeParse({ ...validReview, total: 120 });
    expect(result.success).toBe(false);
  });

  it('rejects installment totals that do not match the invoice', () => {
    const result = invoiceReviewInputSchema.safeParse({
      ...validReview,
      installments: [{ amount: 80, dueDate: '2026-08-14' }],
    });
    expect(result.success).toBe(false);
  });
});
