import { z } from 'zod';

import { organizationRoleSchema, platformRoleSchema } from './access.js';

export const CURRENT_TERMS_VERSION = '2026-07-15.v1';
export const CURRENT_PRIVACY_VERSION = '2026-07-15.v1';

export const membershipStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export function normalizeBrazilianDocument(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCnpj(value: string): boolean {
  const document = normalizeBrazilianDocument(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(document) || /^(\d)\1{13}$/.test(document)) {
    return false;
  }

  const calculateDigit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) =>
        total + (document.charCodeAt(index) - 48) * weight,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return Number(document[12]) === calculateDigit(12) && Number(document[13]) === calculateDigit(13);
}

export const organizationDocumentSchema = z
  .string()
  .trim()
  .transform(normalizeBrazilianDocument)
  .refine(isValidCnpj, 'Informe um CNPJ valido.');

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

const nullableEmail = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.string().trim().toLowerCase().email().max(255).nullable(),
);

const nullableDocument = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  organizationDocumentSchema.nullable(),
);

const nullablePostalCode = z.preprocess(
  (value) =>
    value === '' || value === undefined ? null : String(value).replace(/\D/g, ''),
  z.string().length(8, 'Informe um CEP com 8 digitos.').nullable(),
);

const nullableState = z.preprocess(
  (value) =>
    value === '' || value === undefined ? null : String(value).trim().toUpperCase(),
  z.string().length(2, 'Informe a UF com 2 letras.').regex(/^[A-Z]{2}$/).nullable(),
);

export const organizationSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).nullable(),
  document: z.string().trim().max(18).nullable(),
  email: z.string().email().nullable(),
  phone: z.string().max(30).nullable(),
  postalCode: z.string().length(8).nullable(),
  street: z.string().max(160).nullable(),
  addressNumber: z.string().max(30).nullable(),
  addressComplement: z.string().max(100).nullable(),
  district: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  state: z.string().length(2).nullable(),
  slug: z.string().trim().min(2).max(80),
  role: organizationRoleSchema,
  active: z.boolean(),
});
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

export const userContextSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).nullable(),
  termsAcceptedAt: z.string().datetime().nullable(),
  termsVersion: z.string().max(40).nullable(),
  privacyAcceptedAt: z.string().datetime().nullable(),
  privacyVersion: z.string().max(40).nullable(),
  platformRoles: z.array(platformRoleSchema),
  organizations: z.array(organizationSummarySchema),
});
export type UserContext = z.infer<typeof userContextSchema>;

export const activeOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
});
export type ActiveOrganization = z.infer<typeof activeOrganizationSchema>;

export const createOrganizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  document: nullableDocument,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const updateOrganizationInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    legalName: nullableText(160),
    document: nullableDocument,
    email: nullableEmail,
    phone: nullableText(30),
    postalCode: nullablePostalCode,
    street: nullableText(160),
    addressNumber: nullableText(30),
    addressComplement: nullableText(100),
    district: nullableText(100),
    city: nullableText(100),
    state: nullableState,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um dado da empresa para alterar.',
  });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInputSchema>;

export const updateUserProfileInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: nullableText(30).optional(),
    acceptTerms: z.literal(true).optional(),
    acceptPrivacy: z.literal(true).optional(),
  })
  .refine(
    (value) =>
      value.phone !== undefined ||
        value.name !== undefined ||
        value.acceptTerms === true ||
        value.acceptPrivacy === true,
    { message: 'Informe ao menos uma alteracao de perfil.' },
  );
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileInputSchema>;

export function hasCurrentLegalAcceptance(
  context: Pick<
    UserContext,
    'termsAcceptedAt' | 'termsVersion' | 'privacyAcceptedAt' | 'privacyVersion'
  >,
): boolean {
  return (
    context.termsAcceptedAt !== null &&
    context.termsVersion === CURRENT_TERMS_VERSION &&
    context.privacyAcceptedAt !== null &&
    context.privacyVersion === CURRENT_PRIVACY_VERSION
  );
}

export const organizationMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  phone: z.string().trim().max(30).nullable(),
  role: organizationRoleSchema,
  status: membershipStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const inviteOrganizationMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().min(2).max(120).optional(),
  role: organizationRoleSchema,
});
export type InviteOrganizationMemberInput = z.infer<
  typeof inviteOrganizationMemberInputSchema
>;

export const updateOrganizationMemberInputSchema = z
  .object({
    role: organizationRoleSchema.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Informe o papel ou o status que deve ser alterado.',
  });
export type UpdateOrganizationMemberInput = z.infer<
  typeof updateOrganizationMemberInputSchema
>;
