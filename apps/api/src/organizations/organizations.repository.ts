import type {
  CreateOrganizationInput,
  MembershipStatus,
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
  UpdateOrganizationInput,
  UpdateOrganizationMemberInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';

export type RepositoryUser = {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  phone?: string | null;
};

export type ProvisionedMember = {
  authUserId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  status: MembershipStatus;
};

export abstract class OrganizationsRepository {
  abstract listForUser(user: AuthenticatedIdentity): Promise<OrganizationSummary[]>;

  abstract findAccessible(
    user: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<OrganizationSummary | undefined>;

  abstract createOrganization(
    actor: AuthenticatedIdentity,
    input: CreateOrganizationInput,
  ): Promise<OrganizationSummary>;

  abstract updateOrganization(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationSummary>;

  abstract listMembers(organizationId: string): Promise<OrganizationMember[]>;

  abstract findUserByEmail(email: string): Promise<RepositoryUser | null>;

  abstract upsertMember(
    actor: AuthenticatedIdentity,
    organizationId: string,
    member: ProvisionedMember,
  ): Promise<OrganizationMember>;

  abstract findMember(
    organizationId: string,
    membershipId: string,
  ): Promise<OrganizationMember | null>;

  abstract countActiveAdministrators(organizationId: string): Promise<number>;

  abstract updateMember(
    actor: AuthenticatedIdentity,
    organizationId: string,
    membershipId: string,
    input: UpdateOrganizationMemberInput,
  ): Promise<OrganizationMember>;
}

export function organizationSlug(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return normalized || 'empresa';
}
