import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { OrganizationsService } from '../organizations/organizations.service.js';
import { AuthGuard } from './auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedIdentity) {
    return this.organizations.getUserContext(user);
  }
}
