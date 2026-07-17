import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createOrganizationInputSchema,
  type CreateOrganizationInput,
  updateOrganizationInputSchema,
  type UpdateOrganizationInput,
} from '@compras/contracts';

import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
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

  @Patch(':organizationId')
  @UseGuards(OrganizationAccessGuard, PermissionsGuard)
  @RequirePermission('organization:manage')
  update(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(updateOrganizationInputSchema)) input: UpdateOrganizationInput,
  ) {
    return this.organizations.updateOrganization(user, organizationId, input);
  }
}
