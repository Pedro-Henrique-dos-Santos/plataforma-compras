import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { MemberProvisioningService } from './member-provisioning.service.js';
import { MembersController } from './members.controller.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [OrganizationsController, MembersController],
  providers: [OrganizationsService, MemberProvisioningService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
