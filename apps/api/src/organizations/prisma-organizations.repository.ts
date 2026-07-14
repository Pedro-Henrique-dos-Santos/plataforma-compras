import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  CreateOrganizationInput,
  OrganizationMember,
  OrganizationSummary,
  UpdateOrganizationMemberInput,
} from '@compras/contracts';
import { Prisma, type PrismaClient } from '@compras/database';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { isPlatformOwner } from '../domain/identity.js';
import {
  OrganizationsRepository,
  organizationSlug,
  type ProvisionedMember,
  type RepositoryUser,
} from './organizations.repository.js';

export class PrismaOrganizationsRepository extends OrganizationsRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async listForUser(user: AuthenticatedIdentity): Promise<OrganizationSummary[]> {
    if (isPlatformOwner(user.platformRoles)) {
      const organizations = await this.prisma.organization.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      });
      return organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        document: organization.document,
        slug: organization.slug,
        role: 'ORGANIZATION_ADMIN',
        active: organization.active,
      }));
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        organization: { active: true },
      },
      include: { organization: true },
      orderBy: { organization: { name: 'asc' } },
    });
    return memberships.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      document: organization.document,
      slug: organization.slug,
      role,
      active: organization.active,
    }));
  }

  async findAccessible(
    user: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<OrganizationSummary | undefined> {
    if (isPlatformOwner(user.platformRoles)) {
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, active: true },
      });
      return organization
        ? {
            id: organization.id,
            name: organization.name,
            document: organization.document,
            slug: organization.slug,
            role: 'ORGANIZATION_ADMIN',
            active: organization.active,
          }
        : undefined;
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: user.id,
        status: 'ACTIVE',
        organization: { active: true },
      },
      include: { organization: true },
    });
    return membership
      ? {
          id: membership.organization.id,
          name: membership.organization.name,
          document: membership.organization.document,
          slug: membership.organization.slug,
          role: membership.role,
          active: membership.organization.active,
        }
      : undefined;
  }

  async createOrganization(
    actor: AuthenticatedIdentity,
    input: CreateOrganizationInput,
  ): Promise<OrganizationSummary> {
    const slug = await this.availableSlug(input.name);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const organization = await transaction.organization.create({
          data: {
            name: input.name,
            document: input.document ?? null,
            slug,
            createdById: actor.id,
          },
        });
        await transaction.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: actor.id,
            role: 'ORGANIZATION_ADMIN',
            status: 'ACTIVE',
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId: organization.id,
            action: 'CREATE',
            resource: 'organization',
            resourceId: organization.id,
            metadata: { name: organization.name, document: organization.document },
          },
        });
        return {
          id: organization.id,
          name: organization.name,
          document: organization.document,
          slug: organization.slug,
          role: 'ORGANIZATION_ADMIN' as const,
          active: organization.active,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ja existe uma empresa com este CNPJ ou identificador.');
      }
      throw error;
    }
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });
    return memberships.map((membership) => this.toMember(membership));
  }

  async findUserByEmail(email: string): Promise<RepositoryUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user
      ? {
          id: user.id,
          authUserId: user.authUserId,
          email: user.email,
          name: user.name,
        }
      : null;
  }

  async upsertMember(
    actor: AuthenticatedIdentity,
    organizationId: string,
    provisioned: ProvisionedMember,
  ): Promise<OrganizationMember> {
    return this.prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findFirst({
        where: {
          OR: [{ authUserId: provisioned.authUserId }, { email: provisioned.email }],
        },
      });
      const user = existingUser
        ? await transaction.user.update({
            where: { id: existingUser.id },
            data: {
              authUserId: provisioned.authUserId,
              email: provisioned.email,
              name: provisioned.name,
              active: true,
            },
          })
        : await transaction.user.create({
            data: {
              authUserId: provisioned.authUserId,
              email: provisioned.email,
              name: provisioned.name,
              active: true,
            },
          });

      const membership = await transaction.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId, userId: user.id } },
        update: { role: provisioned.role, status: provisioned.status },
        create: {
          organizationId,
          userId: user.id,
          role: provisioned.role,
          status: provisioned.status,
        },
        include: { user: true },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'CREATE',
          resource: 'organization_membership',
          resourceId: membership.id,
          metadata: {
            email: provisioned.email,
            role: provisioned.role,
            status: provisioned.status,
          },
        },
      });
      return this.toMember(membership);
    });
  }

  async findMember(
    organizationId: string,
    membershipId: string,
  ): Promise<OrganizationMember | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: { user: true },
    });
    return membership ? this.toMember(membership) : null;
  }

  async countActiveAdministrators(organizationId: string): Promise<number> {
    return this.prisma.organizationMembership.count({
      where: { organizationId, role: 'ORGANIZATION_ADMIN', status: 'ACTIVE' },
    });
  }

  async updateMember(
    actor: AuthenticatedIdentity,
    organizationId: string,
    membershipId: string,
    input: UpdateOrganizationMemberInput,
  ): Promise<OrganizationMember> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.organizationMembership.findFirst({
        where: { id: membershipId, organizationId },
      });
      if (!current) {
        throw new NotFoundException('Vinculo de usuario nao encontrado.');
      }
      const membership = await transaction.organizationMembership.update({
        where: { id: membershipId },
        data: input,
        include: { user: true },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'organization_membership',
          resourceId: membership.id,
          metadata: input,
        },
      });
      return this.toMember(membership);
    });
  }

  private async availableSlug(name: string): Promise<string> {
    const base = organizationSlug(name);
    let slug = base;
    let suffix = 2;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }

  private toMember(membership: {
    id: string;
    role: OrganizationMember['role'];
    status: OrganizationMember['status'];
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; email: string; name: string };
  }): OrganizationMember {
    return {
      id: membership.id,
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }
}
