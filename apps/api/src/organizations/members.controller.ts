import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  inviteOrganizationMemberInputSchema,
  updateOrganizationMemberInputSchema,
  type InviteOrganizationMemberInput,
  type UpdateOrganizationMemberInput,
} from '@compras/contracts';

import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PermissionsGuard } from '../access/permissions.guard.js';
import { RequirePermission } from '../access/require-permission.decorator.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations/:organizationId/members')
@UseGuards(AuthGuard, OrganizationAccessGuard, PermissionsGuard)
@RequirePermission('member:manage')
export class MembersController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    return this.organizations.listMembers(user, organizationId);
  }

  @Post()
  invite(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body(new ZodValidationPipe(inviteOrganizationMemberInputSchema))
    input: InviteOrganizationMemberInput,
  ) {
    return this.organizations.inviteMember(user, organizationId, input);
  }

  @Patch(':membershipId')
  update(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Body(new ZodValidationPipe(updateOrganizationMemberInputSchema))
    input: UpdateOrganizationMemberInput,
  ) {
    return this.organizations.updateMember(user, organizationId, membershipId, input);
  }
}
