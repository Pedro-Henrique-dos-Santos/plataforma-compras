import { describe, expect, it } from 'vitest';

import { demoUserContext, HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { DemoOrganizationsRepository } from './demo-organizations.repository.js';
import { organizationSlug } from './organizations.repository.js';

const owner: AuthenticatedIdentity = {
  id: demoUserContext.id,
  authUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: demoUserContext.email,
  name: demoUserContext.name,
  platformRoles: ['PLATFORM_OWNER'],
};

describe('DemoOrganizationsRepository', () => {
  it('creates an isolated organization with the actor as administrator', async () => {
    const repository = new DemoOrganizationsRepository();
    const organization = await repository.createOrganization(owner, {
      name: 'Clinica Sao Jose',
      document: null,
    });

    expect(organization.slug).toBe('clinica-sao-jose');
    expect(organization.role).toBe('ORGANIZATION_ADMIN');
    expect(await repository.findAccessible(owner, organization.id)).toEqual(organization);
  });

  it('upserts a member without granting a platform role', async () => {
    const repository = new DemoOrganizationsRepository();
    const member = await repository.upsertMember(owner, HUMAN_CLINIC_ID, {
      authUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      email: 'consulta@example.com',
      name: 'Consulta Gerencial',
      role: 'REPORT_VIEWER',
      status: 'INVITED',
    });

    expect(member.role).toBe('REPORT_VIEWER');
    expect(member.status).toBe('INVITED');
    expect(member.email).toBe('consulta@example.com');
  });

  it('creates stable URL slugs', () => {
    expect(organizationSlug('Gestao & Saude Sao Paulo')).toBe('gestao-saude-sao-paulo');
  });
});
