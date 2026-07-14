import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedIdentity) {
    return this.organizations.listForUser(user);
  }
}
