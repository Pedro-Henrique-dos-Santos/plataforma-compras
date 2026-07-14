import { z } from 'zod';

import { organizationRoleSchema, platformRoleSchema } from './access.js';

export const membershipStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export function normalizeBrazilianDocument(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  const calculateDigit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) => total + Number(digits[index]) * weight,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return Number(digits[12]) === calculateDigit(12) && Number(digits[13]) === calculateDigit(13);
}

export const organizationDocumentSchema = z
  .string()
  .trim()
  .transform(normalizeBrazilianDocument)
  .refine(isValidCnpj, 'Informe um CNPJ valido.');

export const organizationSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  document: z.string().trim().max(18).nullable(),
  slug: z.string().trim().min(2).max(80),
  role: organizationRoleSchema,
  active: z.boolean(),
});
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

export const userContextSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().trim().min(2).max(120),
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
  document: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    organizationDocumentSchema.nullable(),
  ),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const organizationMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
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
