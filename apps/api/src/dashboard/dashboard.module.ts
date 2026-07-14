import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [IdentityModule, OrganizationsModule, AccessModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
