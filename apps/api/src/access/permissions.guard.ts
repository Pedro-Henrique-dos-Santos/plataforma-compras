import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  hasOrganizationPermission,
  type Permission,
} from '@compras/contracts';

import { isPlatformOwner, type RequestWithIdentity } from '../domain/identity.js';
import { REQUIRED_PERMISSIONS_KEY } from './require-permission.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    if (request.user && isPlatformOwner(request.user.platformRoles)) {
      return true;
    }

    const role = request.activeOrganization?.role;
    const allowed =
      role !== undefined &&
      required.every((permission) => hasOrganizationPermission(role, permission));

    if (!allowed) {
      throw new ForbiddenException('Insufficient permission.');
    }
    return true;
  }
}
