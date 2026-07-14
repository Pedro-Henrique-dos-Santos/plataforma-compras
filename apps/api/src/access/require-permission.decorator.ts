import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@compras/contracts';

export const REQUIRED_PERMISSIONS_KEY = 'required-permissions';

export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

