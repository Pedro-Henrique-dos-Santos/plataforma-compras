import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { activeOrganizationSchema } from '@compras/contracts';

import type { RequestWithIdentity } from '../domain/identity.js';
import { OrganizationsRepository } from '../organizations/organizations.repository.js';

@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    @Inject(OrganizationsRepository)
    private readonly organizations: OrganizationsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    if (!request.user) {
      throw new UnauthorizedException();
    }

    const organizationId = request.headers['x-organization-id'];
    if (typeof organizationId !== 'string' || !organizationId) {
      throw new BadRequestException('x-organization-id header is required.');
    }
    const parsedOrganization = activeOrganizationSchema.safeParse({ organizationId });
    if (!parsedOrganization.success) {
      throw new BadRequestException('x-organization-id header must be a valid UUID.');
    }
    const activeOrganizationId = parsedOrganization.data.organizationId;

    const routeOrganizationId = request.params['organizationId'];
    if (routeOrganizationId && routeOrganizationId !== activeOrganizationId) {
      throw new BadRequestException('Organization header and route must match.');
    }

    const organization = await this.organizations.findAccessible(
      request.user,
      activeOrganizationId,
    );
    if (!organization) {
      throw new ForbiddenException('Organization is not available to this user.');
    }

    request.activeOrganization = organization;
    return true;
  }
}
