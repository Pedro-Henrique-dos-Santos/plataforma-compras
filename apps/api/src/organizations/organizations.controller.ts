import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import {
  createOrganizationInputSchema,
  type CreateOrganizationInput,
} from '@compras/contracts';

import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
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

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('platform:manage')
  create(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(createOrganizationInputSchema)) input: CreateOrganizationInput,
  ) {
    return this.organizations.createOrganization(user, input);
  }
}
