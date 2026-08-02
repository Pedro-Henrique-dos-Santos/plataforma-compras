import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { PurchasesController } from './purchases.controller.js';
import { ApprovalsController } from './approvals.controller.js';
import { PayablesController } from './payables.controller.js';
import { PurchasesService } from './purchases.service.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [PurchasesController, ApprovalsController, PayablesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
