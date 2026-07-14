import { describe, expect, it, vi } from 'vitest';

import { demoUserContext, HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { DemoOrganizationsRepository } from './demo-organizations.repository.js';
import type { MemberProvisioningService } from './member-provisioning.service.js';
import { OrganizationsService } from './organizations.service.js';

const owner: AuthenticatedIdentity = {
  id: demoUserContext.id,
  authUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: demoUserContext.email,
  name: demoUserContext.name,
  platformRoles: ['PLATFORM_OWNER'],
};

function createService() {
  const repository = new DemoOrganizationsRepository();
  const provisioning = {
    invite: vi.fn().mockResolvedValue({
      authUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      status: 'INVITED',
    }),
  } as unknown as MemberProvisioningService;
  return { repository, service: new OrganizationsService(repository, provisioning) };
}

describe('OrganizationsService', () => {
  it('invites a user with an organization role only', async () => {
    const { service } = createService();
    const member = await service.inviteMember(owner, HUMAN_CLINIC_ID, {
      email: 'relatorios@example.com',
      name: 'Relatorios Gerenciais',
      role: 'REPORT_VIEWER',
    });

    expect(member.role).toBe('REPORT_VIEWER');
    expect(member.status).toBe('INVITED');
  });

  it('prevents removal of the final active organization administrator', async () => {
    const { service } = createService();
    const members = await service.listMembers(owner, HUMAN_CLINIC_ID);
    const administrator = members.find((member) => member.role === 'ORGANIZATION_ADMIN');

    expect(administrator).toBeDefined();
    await expect(
      service.updateMember(owner, HUMAN_CLINIC_ID, administrator?.id ?? '', {
        status: 'SUSPENDED',
      }),
    ).rejects.toThrow(/ao menos um administrador ativo/);
  });
});
