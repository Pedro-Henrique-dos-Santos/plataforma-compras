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
  phone?: string | null;
  termsAcceptedAt?: string | null;
  termsVersion?: string | null;
  privacyAcceptedAt?: string | null;
  privacyVersion?: string | null;
};

export type RequestWithIdentity = Request & {
  user?: AuthenticatedIdentity;
  activeOrganization?: OrganizationSummary;
};

export function isPlatformOwner(roles: readonly PlatformRole[]): boolean {
  return roles.includes('PLATFORM_OWNER');
}
