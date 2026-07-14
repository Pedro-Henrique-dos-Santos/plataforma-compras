import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module.js';
import { OrganizationAccessGuard } from './organization-access.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  imports: [OrganizationsModule],
  providers: [OrganizationAccessGuard, PermissionsGuard],
  exports: [OrganizationAccessGuard, PermissionsGuard],
})
export class AccessModule {}

