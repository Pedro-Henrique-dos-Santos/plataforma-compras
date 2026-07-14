import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AuthController } from './auth.controller.js';
import { IdentityModule } from './identity.module.js';

@Module({
  imports: [IdentityModule, OrganizationsModule],
  controllers: [AuthController],
  exports: [IdentityModule],
})
export class AuthModule {}
