import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  CreateOrganizationInput,
  MembershipStatus,
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
  UpdateOrganizationInput,
  UpdateOrganizationMemberInput,
} from '@compras/contracts';

import {
  DEMO_AUTH_USER_ID,
  DEMO_USER_ID,
  EXAMPLE_COMPANY_ID,
  HUMAN_CLINIC_ID,
  demoOrganizations,
  demoUserContext,
} from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { isPlatformOwner } from '../domain/identity.js';
import {
  OrganizationsRepository,
  organizationSlug,
  type ProvisionedMember,
  type RepositoryUser,
} from './organizations.repository.js';

type DemoOrganization = Omit<OrganizationSummary, 'role'>;
type DemoMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
};

const OWNER_HUMAN_MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333331';
const BUYER_MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333332';
const OWNER_EXAMPLE_MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const BUYER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BUYER_AUTH_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const INITIAL_DATE = '2026-07-01T12:00:00.000Z';

export class DemoOrganizationsRepository extends OrganizationsRepository {
  private readonly organizations: DemoOrganization[] = demoOrganizations.map(
    ({ role: _role, ...organization }) => ({ ...organization }),
  );

  private readonly users: RepositoryUser[] = [
    {
      id: DEMO_USER_ID,
      authUserId: DEMO_AUTH_USER_ID,
      email: demoUserContext.email,
      name: demoUserContext.name,
      phone: demoUserContext.phone,
    },
    {
      id: BUYER_USER_ID,
      authUserId: BUYER_AUTH_USER_ID,
      email: 'compras@humanclinic.com.br',
      name: 'Equipe de Compras',
      phone: '+5511988888888',
    },
  ];

  private readonly memberships: DemoMembership[] = [
    {
      id: OWNER_HUMAN_MEMBERSHIP_ID,
      organizationId: HUMAN_CLINIC_ID,
      userId: DEMO_USER_ID,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
      createdAt: INITIAL_DATE,
      updatedAt: INITIAL_DATE,
    },
    {
      id: BUYER_MEMBERSHIP_ID,
      organizationId: HUMAN_CLINIC_ID,
      userId: BUYER_USER_ID,
      role: 'BUYER',
      status: 'ACTIVE',
      createdAt: INITIAL_DATE,
      updatedAt: INITIAL_DATE,
    },
    {
      id: OWNER_EXAMPLE_MEMBERSHIP_ID,
      organizationId: EXAMPLE_COMPANY_ID,
      userId: DEMO_USER_ID,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
      createdAt: INITIAL_DATE,
      updatedAt: INITIAL_DATE,
    },
  ];

  async listForUser(user: AuthenticatedIdentity): Promise<OrganizationSummary[]> {
    const memberships = this.memberships.filter(
      (membership) => membership.userId === user.id && membership.status === 'ACTIVE',
    );

    return this.organizations
      .filter((organization) => {
        return (
          organization.active &&
          (isPlatformOwner(user.platformRoles) ||
            memberships.some((membership) => membership.organizationId === organization.id))
        );
      })
      .map((organization) => ({
        ...organization,
        role:
          memberships.find((membership) => membership.organizationId === organization.id)?.role ??
          'ORGANIZATION_ADMIN',
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }

  async findAccessible(
    user: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<OrganizationSummary | undefined> {
    return (await this.listForUser(user)).find(
      (organization) => organization.id === organizationId,
    );
  }

  async createOrganization(
    actor: AuthenticatedIdentity,
    input: CreateOrganizationInput,
  ): Promise<OrganizationSummary> {
    if (
      input.document &&
      this.organizations.some((organization) => organization.document === input.document)
    ) {
      throw new ConflictException('Ja existe uma empresa cadastrada com este CNPJ.');
    }

    const baseSlug = organizationSlug(input.name);
    let slug = baseSlug;
    let suffix = 2;
    while (this.organizations.some((organization) => organization.slug === slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const organization: DemoOrganization = {
      id: randomUUID(),
      name: input.name,
      legalName: null,
      document: input.document ?? null,
      email: null,
      phone: null,
      postalCode: null,
      street: null,
      addressNumber: null,
      addressComplement: null,
      district: null,
      city: null,
      state: null,
      slug,
      active: true,
    };
    this.organizations.push(organization);

    const now = new Date().toISOString();
    this.memberships.push({
      id: randomUUID(),
      organizationId: organization.id,
      userId: actor.id,
      role: 'ORGANIZATION_ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    return { ...organization, role: 'ORGANIZATION_ADMIN' };
  }

  async updateOrganization(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationSummary> {
    const organization = this.organizations.find(
      (candidate) => candidate.id === organizationId,
    );
    if (!organization) {
      throw new NotFoundException('Empresa nao encontrada.');
    }
    if (
      input.document &&
      this.organizations.some(
        (candidate) =>
          candidate.id !== organizationId && candidate.document === input.document,
      )
    ) {
      throw new ConflictException('Ja existe uma empresa cadastrada com este CNPJ.');
    }
    Object.assign(organization, input);
    const role = (await this.findAccessible(actor, organizationId))?.role ?? 'ORGANIZATION_ADMIN';
    return { ...organization, role };
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    return this.memberships
      .filter((membership) => membership.organizationId === organizationId)
      .map((membership) => this.toMember(membership))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }

  async findUserByEmail(email: string): Promise<RepositoryUser | null> {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async upsertMember(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    provisioned: ProvisionedMember,
  ): Promise<OrganizationMember> {
    let user =
      this.users.find((candidate) => candidate.email === provisioned.email) ??
      this.users.find((candidate) => candidate.authUserId === provisioned.authUserId);
    if (!user) {
      user = {
        id: randomUUID(),
        authUserId: provisioned.authUserId,
        email: provisioned.email,
        name: provisioned.name,
      };
      this.users.push(user);
    } else {
      user.name = provisioned.name;
      user.email = provisioned.email;
    }

    const now = new Date().toISOString();
    let membership = this.memberships.find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.userId === user.id,
    );
    if (membership) {
      membership.role = provisioned.role;
      membership.status = provisioned.status;
      membership.updatedAt = now;
    } else {
      membership = {
        id: randomUUID(),
        organizationId,
        userId: user.id,
        role: provisioned.role,
        status: provisioned.status,
        createdAt: now,
        updatedAt: now,
      };
      this.memberships.push(membership);
    }

    return this.toMember(membership);
  }

  async findMember(
    organizationId: string,
    membershipId: string,
  ): Promise<OrganizationMember | null> {
    const membership = this.memberships.find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.id === membershipId,
    );
    return membership ? this.toMember(membership) : null;
  }

  async countActiveAdministrators(organizationId: string): Promise<number> {
    return this.memberships.filter(
      (membership) =>
        membership.organizationId === organizationId &&
        membership.role === 'ORGANIZATION_ADMIN' &&
        membership.status === 'ACTIVE',
    ).length;
  }

  async updateMember(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    membershipId: string,
    input: UpdateOrganizationMemberInput,
  ): Promise<OrganizationMember> {
    const membership = this.memberships.find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.id === membershipId,
    );
    if (!membership) {
      throw new NotFoundException('Vinculo de usuario nao encontrado.');
    }

    membership.role = input.role ?? membership.role;
    membership.status = input.status ?? membership.status;
    membership.updatedAt = new Date().toISOString();
    return this.toMember(membership);
  }

  private toMember(membership: DemoMembership): OrganizationMember {
    const user = this.users.find((candidate) => candidate.id === membership.userId);
    if (!user) {
      throw new Error('Demo membership references an unknown user.');
    }
    return {
      id: membership.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    };
  }
}
