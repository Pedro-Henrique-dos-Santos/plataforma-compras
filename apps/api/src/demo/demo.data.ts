import type {
  OrganizationSummary,
  UserContext,
} from '@compras/contracts';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@compras/contracts';

export const DEMO_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const DEMO_AUTH_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const HUMAN_CLINIC_ID = '11111111-1111-4111-8111-111111111111';
export const EXAMPLE_COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const INITIAL_ACCEPTANCE_DATE = '2026-07-01T12:00:00.000Z';

export const demoOrganizations: OrganizationSummary[] = [
  {
    id: HUMAN_CLINIC_ID,
    name: 'Human Clinic',
    legalName: null,
    document: null,
    email: null,
    phone: null,
    postalCode: null,
    street: null,
    addressNumber: null,
    addressComplement: null,
    district: null,
    city: null,
    state: null,
    slug: 'human-clinic',
    role: 'ORGANIZATION_ADMIN',
    active: true,
  },
  {
    id: EXAMPLE_COMPANY_ID,
    name: 'Empresa demonstrativa',
    legalName: null,
    document: null,
    email: null,
    phone: null,
    postalCode: null,
    street: null,
    addressNumber: null,
    addressComplement: null,
    district: null,
    city: null,
    state: null,
    slug: 'empresa-demonstrativa',
    role: 'ORGANIZATION_ADMIN',
    active: true,
  },
];

export const demoUserContext: UserContext = {
  id: DEMO_USER_ID,
  email: 'proprietario@plataforma.local',
  name: 'Proprietario da plataforma',
  termsAcceptedAt: INITIAL_ACCEPTANCE_DATE,
  termsVersion: CURRENT_TERMS_VERSION,
  privacyAcceptedAt: INITIAL_ACCEPTANCE_DATE,
  privacyVersion: CURRENT_PRIVACY_VERSION,
  platformRoles: ['PLATFORM_OWNER'],
  organizations: demoOrganizations,
};

