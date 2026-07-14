import type { OrganizationSummary } from '@compras/contracts';

export function resolveInitialOrganization(
  organizations: readonly OrganizationSummary[],
  storedId: string | null,
): OrganizationSummary | null {
  if (!organizations.length) {
    return null;
  }

  return (
    organizations.find(
      (organization) => organization.id === storedId && organization.active,
    ) ?? organizations.find((organization) => organization.active) ?? null
  );
}

