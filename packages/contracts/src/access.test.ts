import { describe, expect, it } from 'vitest';

import {
  hasAccessPermission,
  hasOrganizationPermission,
} from './access.js';

describe('organization access', () => {
  it('allows a buyer to operate purchases', () => {
    expect(hasOrganizationPermission('BUYER', 'purchase:write')).toBe(true);
  });

  it('keeps report viewers read-only', () => {
    expect(hasOrganizationPermission('REPORT_VIEWER', 'purchase:read')).toBe(true);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'purchase:write')).toBe(false);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'cost-center:read')).toBe(true);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'cost-center:write')).toBe(false);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'integration:read')).toBe(true);
    expect(hasOrganizationPermission('REPORT_VIEWER', 'integration:write')).toBe(false);
  });

  it('does not grant platform management to company roles', () => {
    expect(hasOrganizationPermission('ORGANIZATION_ADMIN', 'platform:manage')).toBe(false);
  });

  it('grants every permission to the independent platform owner', () => {
    expect(hasAccessPermission(['PLATFORM_OWNER'], undefined, 'platform:manage')).toBe(true);
    expect(
      hasAccessPermission(
        ['PLATFORM_OWNER'],
        'REPORT_VIEWER',
        'integration:write',
      ),
    ).toBe(true);
  });

  it('uses the organization permission matrix for company users', () => {
    expect(hasAccessPermission([], 'BUYER', 'purchase:write')).toBe(true);
    expect(hasAccessPermission([], 'BUYER', 'integration:write')).toBe(false);
    expect(hasAccessPermission([], 'REPORT_VIEWER', 'invoice:write')).toBe(false);
    expect(hasAccessPermission([], undefined, 'dashboard:read')).toBe(false);
  });
});

