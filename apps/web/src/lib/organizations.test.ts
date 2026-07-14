import { describe, expect, it } from 'vitest';
import type { OrganizationSummary } from '@compras/contracts';

import { resolveInitialOrganization } from './organizations';

const organizations: OrganizationSummary[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Empresa A',
    document: null,
    slug: 'empresa-a',
    role: 'ORGANIZATION_ADMIN',
    active: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Empresa B',
    document: null,
    slug: 'empresa-b',
    role: 'BUYER',
    active: true,
  },
];

describe('resolveInitialOrganization', () => {
  it('restores an accessible organization', () => {
    expect(resolveInitialOrganization(organizations, organizations[1]?.id ?? null)?.name).toBe(
      'Empresa B',
    );
  });

  it('falls back to the first active organization', () => {
    expect(resolveInitialOrganization(organizations, 'inaccessible')?.name).toBe('Empresa A');
  });
});

