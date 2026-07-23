import { describe, expect, it } from 'vitest';

import { getOrganizationCapabilities } from './access';

describe('organization capabilities', () => {
  it('grants company administration and operational writes to administrators', () => {
    const capabilities = getOrganizationCapabilities(
      { platformRoles: [] },
      { role: 'ORGANIZATION_ADMIN' },
    );

    expect(capabilities).toEqual({
      canManageMembers: true,
      canManageOrganization: true,
      canManagePlatform: false,
      canWriteCostCenters: true,
      canWriteIntegrations: true,
      canWriteInvoices: true,
      canWritePrices: true,
      canWritePurchases: true,
      canWriteSuppliers: true,
    });
  });

  it('keeps integration administration away from buyers', () => {
    const capabilities = getOrganizationCapabilities(
      { platformRoles: [] },
      { role: 'BUYER' },
    );

    expect(capabilities.canWritePurchases).toBe(true);
    expect(capabilities.canWriteSuppliers).toBe(true);
    expect(capabilities.canWritePrices).toBe(true);
    expect(capabilities.canWriteCostCenters).toBe(true);
    expect(capabilities.canWriteInvoices).toBe(true);
    expect(capabilities.canWriteIntegrations).toBe(false);
    expect(capabilities.canManageOrganization).toBe(false);
    expect(capabilities.canManageMembers).toBe(false);
  });

  it('keeps report viewers read-only', () => {
    const capabilities = getOrganizationCapabilities(
      { platformRoles: [] },
      { role: 'REPORT_VIEWER' },
    );

    expect(
      Object.entries(capabilities)
        .filter(([name]) => name.startsWith('canWrite'))
        .every(([, allowed]) => !allowed),
    ).toBe(true);
    expect(capabilities.canManageOrganization).toBe(false);
    expect(capabilities.canManageMembers).toBe(false);
  });

  it('grants platform owners the complete capability set', () => {
    const capabilities = getOrganizationCapabilities(
      { platformRoles: ['PLATFORM_OWNER'] },
      { role: 'REPORT_VIEWER' },
    );

    expect(Object.values(capabilities).every(Boolean)).toBe(true);
  });
});
