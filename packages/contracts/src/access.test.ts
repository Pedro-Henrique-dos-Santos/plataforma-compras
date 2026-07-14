import { describe, expect, it } from 'vitest';

import { hasOrganizationPermission } from './access.js';

describe('organization access', () => {
  it('allows a buyer to operate purchases', () => {
    expect(hasOrganizationPermission('BUYER', 'purchase:write')).toBe(true);
  });

  it('keeps report viewers read-only', () => {
    expect(hasOrganizationPermission('REPORT_VIEWER', 'purchase:read')).toBe(true);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'purchase:write')).toBe(false);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'cost-center:read')).toBe(true);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'cost-center:write')).toBe(false);
  });

  it('does not grant platform management to company roles', () => {
    expect(hasOrganizationPermission('ORGANIZATION_ADMIN', 'platform:manage')).toBe(false);
  });
});

