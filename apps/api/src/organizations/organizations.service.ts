import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateOrganizationInput,
  InviteOrganizationMemberInput,
  OrganizationMember,
  OrganizationSummary,
  UpdateOrganizationMemberInput,
  UserContext,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { isPlatformOwner } from '../domain/identity.js';
import { MemberProvisioningService } from './member-provisioning.service.js';
import { OrganizationsRepository } from './organizations.repository.js';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(OrganizationsRepository)
    private readonly repository: OrganizationsRepository,
    @Inject(MemberProvisioningService)
    private readonly provisioning: MemberProvisioningService,
  ) {}

  listForUser(user: AuthenticatedIdentity): Promise<OrganizationSummary[]> {
    return this.repository.listForUser(user);
  }

  findAccessible(
    user: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<OrganizationSummary | undefined> {
    return this.repository.findAccessible(user, organizationId);
  }

  async getUserContext(user: AuthenticatedIdentity): Promise<UserContext> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRoles: user.platformRoles,
      organizations: await this.listForUser(user),
    };
  }

  async createOrganization(
    actor: AuthenticatedIdentity,
    input: CreateOrganizationInput,
  ): Promise<OrganizationSummary> {
    if (!isPlatformOwner(actor.platformRoles)) {
      throw new ForbiddenException('Somente o proprietario global pode criar empresas.');
    }
    return this.repository.createOrganization(actor, input);
  }

  async listMembers(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<OrganizationMember[]> {
    await this.assertAccessible(actor, organizationId);
    return this.repository.listMembers(organizationId);
  }

  async inviteMember(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: InviteOrganizationMemberInput,
  ): Promise<OrganizationMember> {
    const organization = await this.assertAccessible(actor, organizationId);
    const existing = await this.repository.findUserByEmail(input.email);
    const name = input.name ?? existing?.name ?? this.nameFromEmail(input.email);
    const provisioned = existing
      ? { authUserId: existing.authUserId, status: 'ACTIVE' as const }
      : await this.provisioning.invite({
          email: input.email,
          name,
          organizationId,
          organizationName: organization.name,
        });

    return this.repository.upsertMember(actor, organizationId, {
      authUserId: provisioned.authUserId,
      email: input.email,
      name,
      role: input.role,
      status: provisioned.status,
    });
  }

  async updateMember(
    actor: AuthenticatedIdentity,
    organizationId: string,
    membershipId: string,
    input: UpdateOrganizationMemberInput,
  ): Promise<OrganizationMember> {
    await this.assertAccessible(actor, organizationId);
    const current = await this.repository.findMember(organizationId, membershipId);
    if (!current) {
      throw new NotFoundException('Vinculo de usuario nao encontrado.');
    }

    const nextRole = input.role ?? current.role;
    const nextStatus = input.status ?? current.status;
    const removesActiveAdministrator =
      current.role === 'ORGANIZATION_ADMIN' &&
      current.status === 'ACTIVE' &&
      (nextRole !== 'ORGANIZATION_ADMIN' || nextStatus !== 'ACTIVE');
    if (
      removesActiveAdministrator &&
      (await this.repository.countActiveAdministrators(organizationId)) <= 1
    ) {
      throw new ConflictException('A empresa precisa manter ao menos um administrador ativo.');
    }

    return this.repository.updateMember(actor, organizationId, membershipId, input);
  }

  private async assertAccessible(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<OrganizationSummary> {
    const organization = await this.repository.findAccessible(actor, organizationId);
    if (!organization) {
      throw new ForbiddenException('Esta empresa nao esta disponivel para o usuario.');
    }
    return organization;
  }

  private nameFromEmail(email: string): string {
    const localPart = email.split('@')[0] ?? 'Usuario';
    const words = localPart.split(/[._-]+/).filter(Boolean);
    const name = words
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
      .join(' ');
    return name.length >= 2 ? name.slice(0, 120) : 'Usuario convidado';
  }
}
