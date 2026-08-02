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

  it('preserves alphanumeric CNPJ and NF-e access keys', () => {
    const accessKey = '35260712ABC34501DE35550010000000011123456789';
    const parsed = invoiceReviewInputSchema.parse({
      ...validReview,
      supplierDocument: '12.ABC.345/01DE-35',
      accessKey: `NFe${accessKey}`,
    });

    expect(parsed.supplierDocument).toBe('12ABC34501DE35');
    expect(parsed.accessKey).toBe(accessKey);
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
