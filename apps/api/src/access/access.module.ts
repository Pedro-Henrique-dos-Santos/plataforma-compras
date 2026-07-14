import { Module } from '@nestjs/common';

import { OrganizationAccessGuard } from './organization-access.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  providers: [OrganizationAccessGuard, PermissionsGuard],
  exports: [OrganizationAccessGuard, PermissionsGuard],
})
export class AccessModule {}
