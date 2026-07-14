import { z } from 'zod';

import { organizationRoleSchema, platformRoleSchema } from './access.js';

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

