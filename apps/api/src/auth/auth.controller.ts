import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import {
  updateUserProfileInputSchema,
  type UpdateUserProfileInput,
} from '@compras/contracts';
import type { Request } from 'express';

import { OrganizationsService } from '../organizations/organizations.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedIdentity) {
    return this.organizations.getUserContext(user);
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  async updateProfile(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(updateUserProfileInputSchema)) input: UpdateUserProfileInput,
    @Req() request: Request,
  ) {
    const updated = await this.auth.updateProfile(user, input, {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    });
    return this.organizations.getUserContext(updated);
  }
}
