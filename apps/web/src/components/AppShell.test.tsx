import { describe, expect, it } from 'vitest';

import {
  getDefaultModuleView,
  getVisibleModuleNavigation,
  getVisibleModules,
} from '../module-navigation';

describe('AppShell navigation permissions', () => {
  it('allows organization administrators to maintain their company and access list', () => {
    const views = getVisibleModuleNavigation(
      'administration',
      { platformRoles: [] },
      { role: 'ORGANIZATION_ADMIN' },
    ).map((item) => item.id);

    expect(views).toContain('organizations');
    expect(views).toContain('access');
  });

  it('keeps company administration hidden from buyers and report viewers', () => {
    for (const role of ['BUYER', 'REPORT_VIEWER'] as const) {
      const views = getVisibleModuleNavigation(
        'administration',
        { platformRoles: [] },
        { role },
      ).map((item) => item.id);

      expect(views).not.toContain('organizations');
      expect(views).not.toContain('access');
    }
  });

  it('keeps every administration entry available to the platform owner', () => {
    const views = getVisibleModuleNavigation(
      'administration',
      { platformRoles: ['PLATFORM_OWNER'] },
      { role: 'REPORT_VIEWER' },
    ).map((item) => item.id);

    expect(views).toContain('organizations');
    expect(views).toContain('access');
  });

  it('keeps purchasing and finance in separate module menus', () => {
    const user = { platformRoles: ['PLATFORM_OWNER'] as Array<'PLATFORM_OWNER'> };
    const organization = { role: 'ORGANIZATION_ADMIN' as const };
    const purchases = getVisibleModuleNavigation('purchases', user, organization).map(
      (item) => item.id,
    );
    const finance = getVisibleModuleNavigation('finance', user, organization).map(
      (item) => item.id,
    );

    expect(purchases).toContain('purchases');
    expect(purchases).toContain('invoice-documents');
    expect(purchases).not.toContain('payables');
    expect(finance).toEqual(['payables', 'receivables', 'financial-settings']);
  });

  it('opens each module on an accessible default screen', () => {
    const user = { platformRoles: ['PLATFORM_OWNER'] as Array<'PLATFORM_OWNER'> };
    const organization = { role: 'ORGANIZATION_ADMIN' as const };

    expect(getDefaultModuleView('purchases', user, organization)).toBe('dashboard');
    expect(getDefaultModuleView('finance', user, organization)).toBe('payables');
    expect(getDefaultModuleView('administration', user, organization)).toBe('organizations');
  });

  it('shows a module only with the screens permitted for the current role', () => {
    const user = { platformRoles: [] };
    const organization = { role: 'REPORT_VIEWER' as const };
    const modules = getVisibleModules(
      user,
      organization,
    );

    expect(modules.map((module) => module.id)).toEqual([
      'purchases',
      'finance',
      'administration',
    ]);
    expect(getVisibleModuleNavigation('administration', user, organization).map(
      (item) => item.id,
    )).toEqual(['cost-centers', 'integrations']);
  });
});
