import { Injectable } from '@nestjs/common';
import type { OrganizationSummary, UserContext } from '@compras/contracts';

import { demoOrganizations } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { isPlatformOwner } from '../domain/identity.js';

@Injectable()
export class OrganizationsService {
  listForUser(user: AuthenticatedIdentity): OrganizationSummary[] {
    if (isPlatformOwner(user.platformRoles)) {
      return demoOrganizations;
    }

    // Membership persistence is connected in the Supabase integration phase.
    return [];
  }

  findAccessible(
    user: AuthenticatedIdentity,
    organizationId: string,
  ): OrganizationSummary | undefined {
    return this.listForUser(user).find(
      (organization) => organization.id === organizationId && organization.active,
    );
  }

  getUserContext(user: AuthenticatedIdentity): UserContext {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRoles: user.platformRoles,
      organizations: this.listForUser(user),
    };
  }
}

