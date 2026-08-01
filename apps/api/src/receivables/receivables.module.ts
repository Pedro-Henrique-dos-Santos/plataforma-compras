import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { ReceivablesController } from './receivables.controller.js';
import { ReceivablesService } from './receivables.service.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
})
export class ReceivablesModule {}
