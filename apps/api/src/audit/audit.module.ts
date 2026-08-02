import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [AccessModule, IdentityModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
