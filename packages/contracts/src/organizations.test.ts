import { describe, expect, it } from 'vitest';

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  createOrganizationInputSchema,
  hasCurrentLegalAcceptance,
  isValidCnpj,
  normalizeBrazilianDocument,
  updateOrganizationInputSchema,
  updateOrganizationMemberInputSchema,
  updateUserProfileInputSchema,
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

  it('accepts and normalizes an alphanumeric CNPJ', () => {
    const input = createOrganizationInputSchema.parse({
      name: 'Empresa Alfanumerica',
      document: '12.ABC.345/01DE-35',
    });

    expect(input.document).toBe('12ABC34501DE35');
    expect(isValidCnpj(input.document ?? '')).toBe(true);
    expect(isValidCnpj('12ABC34501DE34')).toBe(false);
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

  it('normalizes company profile fields and requires a real change', () => {
    expect(
      updateOrganizationInputSchema.parse({
        document: '11.222.333/0001-81',
        postalCode: '01310-100',
        state: 'sp',
      }),
    ).toEqual({
      document: '11222333000181',
      postalCode: '01310100',
      state: 'SP',
    });
    expect(() => updateOrganizationInputSchema.parse({})).toThrow();
  });

  it('accepts a display name change or explicit legal acceptance', () => {
    expect(updateUserProfileInputSchema.parse({ name: 'Pedro Santos' })).toEqual({
      name: 'Pedro Santos',
    });
    expect(
      updateUserProfileInputSchema.parse({ acceptTerms: true, acceptPrivacy: true }),
    ).toEqual({ acceptTerms: true, acceptPrivacy: true });
    expect(() => updateUserProfileInputSchema.parse({})).toThrow();
  });

  it('requires timestamps and the current versions for legal acceptance', () => {
    const acceptedAt = '2026-07-15T12:00:00.000Z';
    expect(
      hasCurrentLegalAcceptance({
        termsAcceptedAt: acceptedAt,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyAcceptedAt: acceptedAt,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      }),
    ).toBe(true);
    expect(
      hasCurrentLegalAcceptance({
        termsAcceptedAt: null,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyAcceptedAt: acceptedAt,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      }),
    ).toBe(false);
  });
});
