import { describe, expect, it } from 'vitest';

import { getVisibleNavigation } from './AppShell';

describe('AppShell navigation permissions', () => {
  it('allows organization administrators to maintain their company and access list', () => {
    const views = getVisibleNavigation(
      { platformRoles: [] },
      { role: 'ORGANIZATION_ADMIN' },
    ).map((item) => item.id);

    expect(views).toContain('organizations');
    expect(views).toContain('access');
  });

  it('keeps company administration hidden from buyers and report viewers', () => {
    for (const role of ['BUYER', 'REPORT_VIEWER'] as const) {
      const views = getVisibleNavigation({ platformRoles: [] }, { role }).map(
        (item) => item.id,
      );

      expect(views).not.toContain('organizations');
      expect(views).not.toContain('access');
    }
  });

  it('keeps every administration entry available to the platform owner', () => {
    const views = getVisibleNavigation(
      { platformRoles: ['PLATFORM_OWNER'] },
      { role: 'REPORT_VIEWER' },
    ).map((item) => item.id);

    expect(views).toContain('organizations');
    expect(views).toContain('access');
  });
});
