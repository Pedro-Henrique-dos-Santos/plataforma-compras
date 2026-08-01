import { z } from 'zod';

export const platformRoleSchema = z.enum(['PLATFORM_OWNER']);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const organizationRoleSchema = z.enum([
  'ORGANIZATION_ADMIN',
  'BUYER',
  'FINANCE',
  'REPORT_VIEWER',
]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const permissionSchema = z.enum([
  'platform:manage',
  'organization:manage',
  'member:manage',
  'dashboard:read',
  'cost-center:read',
  'cost-center:write',
  'supplier:read',
  'supplier:write',
  'price:read',
  'price:write',
  'purchase:read',
  'purchase:write',
  'approval:read',
  'approval:act',
  'approval:manage',
  'payable:read',
  'payable:write',
  'payment-approval:read',
  'payment-approval:act',
  'payment-approval:manage',
  'payment:settle',
  'receipt:read',
  'receipt:write',
  'invoice:read',
  'invoice:write',
  'fiscal-integration:manage',
  'integration:read',
  'integration:write',
  'report:export',
]);
export type Permission = z.infer<typeof permissionSchema>;

export const organizationRolePermissions: Record<OrganizationRole, readonly Permission[]> = {
  ORGANIZATION_ADMIN: [
    'organization:manage',
    'member:manage',
    'dashboard:read',
    'cost-center:read',
    'cost-center:write',
    'supplier:read',
    'supplier:write',
    'price:read',
    'price:write',
    'purchase:read',
    'purchase:write',
    'approval:read',
    'approval:act',
    'approval:manage',
    'payable:read',
    'payable:write',
    'payment-approval:read',
    'payment-approval:act',
    'payment-approval:manage',
    'payment:settle',
    'receipt:read',
    'receipt:write',
    'invoice:read',
    'invoice:write',
    'fiscal-integration:manage',
    'integration:read',
    'integration:write',
    'report:export',
  ],
  BUYER: [
    'dashboard:read',
    'cost-center:read',
    'cost-center:write',
    'supplier:read',
    'supplier:write',
    'price:read',
    'price:write',
    'purchase:read',
    'purchase:write',
    'approval:read',
    'approval:act',
    'payable:read',
    'payable:write',
    'payment-approval:read',
    'payment-approval:act',
    'receipt:read',
    'receipt:write',
    'invoice:read',
    'invoice:write',
    'integration:read',
    'report:export',
  ],
  FINANCE: [
    'dashboard:read',
    'cost-center:read',
    'supplier:read',
    'purchase:read',
    'approval:read',
    'payable:read',
    'payable:write',
    'payment-approval:read',
    'payment-approval:act',
    'payment:settle',
    'receipt:read',
    'invoice:read',
    'report:export',
  ],
  REPORT_VIEWER: [
    'dashboard:read',
    'cost-center:read',
    'supplier:read',
    'price:read',
    'purchase:read',
    'approval:read',
    'payable:read',
    'payment-approval:read',
    'receipt:read',
    'invoice:read',
    'integration:read',
    'report:export',
  ],
};

export function hasOrganizationPermission(
  role: OrganizationRole,
  permission: Permission,
): boolean {
  return organizationRolePermissions[role].includes(permission);
}

export function hasAccessPermission(
  platformRoles: readonly PlatformRole[],
  organizationRole: OrganizationRole | undefined,
  permission: Permission,
): boolean {
  return (
    platformRoles.includes('PLATFORM_OWNER') ||
    (organizationRole !== undefined &&
      hasOrganizationPermission(organizationRole, permission))
  );
}

