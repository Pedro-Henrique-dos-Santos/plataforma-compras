import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { RequestWithIdentity } from '../domain/identity.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    if (!request.user) {
      throw new UnauthorizedException();
    }

    const organizationId = request.headers['x-organization-id'];
    if (typeof organizationId !== 'string' || !organizationId) {
      throw new BadRequestException('x-organization-id header is required.');
    }

    const organization = this.organizations.findAccessible(
      request.user,
      organizationId,
    );
    if (!organization) {
      throw new ForbiddenException('Organization is not available to this user.');
    }

    request.activeOrganization = organization;
    return true;
  }
}
