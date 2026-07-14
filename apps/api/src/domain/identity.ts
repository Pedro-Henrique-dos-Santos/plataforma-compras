import type {
  OrganizationSummary,
  PlatformRole,
  UserContext,
} from '@compras/contracts';
import type { Request } from 'express';

export type AuthenticatedIdentity = Pick<
  UserContext,
  'id' | 'email' | 'name' | 'platformRoles'
> & {
  authUserId: string;
};

export type RequestWithIdentity = Request & {
  user?: AuthenticatedIdentity;
  activeOrganization?: OrganizationSummary;
};

export function isPlatformOwner(roles: readonly PlatformRole[]): boolean {
  return roles.includes('PLATFORM_OWNER');
}

