import type {
  OrganizationSummary,
  UserContext,
} from '@compras/contracts';

export const DEMO_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const DEMO_AUTH_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const HUMAN_CLINIC_ID = '11111111-1111-4111-8111-111111111111';
export const EXAMPLE_COMPANY_ID = '22222222-2222-4222-8222-222222222222';

export const demoOrganizations: OrganizationSummary[] = [
  {
    id: HUMAN_CLINIC_ID,
    name: 'Human Clinic',
    document: null,
    slug: 'human-clinic',
    role: 'ORGANIZATION_ADMIN',
    active: true,
  },
  {
    id: EXAMPLE_COMPANY_ID,
    name: 'Empresa demonstrativa',
    document: null,
    slug: 'empresa-demonstrativa',
    role: 'ORGANIZATION_ADMIN',
    active: true,
  },
];

export const demoUserContext: UserContext = {
  id: DEMO_USER_ID,
  email: 'proprietario@plataforma.local',
  name: 'Proprietario da plataforma',
  platformRoles: ['PLATFORM_OWNER'],
  organizations: demoOrganizations,
};

