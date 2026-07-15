import { describe, expect, it } from 'vitest';

import {
  createCostCenterInputSchema,
  createSupplierInputSchema,
  importSupplierPricesInputSchema,
} from './master-data.js';

describe('master data contracts', () => {
  it('normalizes cost center codes and optional supplier fields', () => {
    expect(createCostCenterInputSchema.parse({ code: ' assist ', name: 'Assistencial' })).toEqual({
      code: 'ASSIST',
      name: 'Assistencial',
    });
    expect(createSupplierInputSchema.parse({ legalName: 'Fornecedor Teste' })).toMatchObject({
      legalName: 'Fornecedor Teste',
      document: null,
      defaultCostCenterId: null,
    });
  });

  it('rejects inverted price validity and negative values', () => {
    expect(() =>
      importSupplierPricesInputSchema.parse({
        supplierId: '11111111-1111-4111-8111-111111111111',
        items: [
          {
            description: 'Item teste',
            negotiatedPrice: -1,
            validFrom: '2026-08-01',
            validUntil: '2026-07-01',
          },
        ],
      }),
    ).toThrow();
  });

  it('limits bulk imports to one thousand price rows', () => {
    const item = { description: 'Item teste', negotiatedPrice: 10 };
    expect(() =>
      importSupplierPricesInputSchema.parse({
        supplierId: '11111111-1111-4111-8111-111111111111',
        items: Array.from({ length: 1_001 }, () => item),
      }),
    ).toThrow();
  });
});
