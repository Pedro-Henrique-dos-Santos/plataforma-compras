import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
