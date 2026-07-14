import { describe, expect, it } from 'vitest';

import {
  createOrganizationInputSchema,
  isValidCnpj,
  normalizeBrazilianDocument,
  updateOrganizationMemberInputSchema,
} from './organizations.js';

describe('organization contracts', () => {
  it('normalizes and validates a formatted CNPJ', () => {
    const input = createOrganizationInputSchema.parse({
      name: 'Empresa de Teste',
      document: '11.222.333/0001-81',
    });

    expect(input.document).toBe('11222333000181');
    expect(isValidCnpj(input.document ?? '')).toBe(true);
    expect(normalizeBrazilianDocument('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('rejects repeated or invalid CNPJ digits', () => {
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(() =>
      createOrganizationInputSchema.parse({ name: 'Empresa de Teste', document: '123' }),
    ).toThrow();
  });

  it('requires at least one membership change', () => {
    expect(() => updateOrganizationMemberInputSchema.parse({})).toThrow();
    expect(updateOrganizationMemberInputSchema.parse({ role: 'BUYER' })).toEqual({
      role: 'BUYER',
    });
  });
});
