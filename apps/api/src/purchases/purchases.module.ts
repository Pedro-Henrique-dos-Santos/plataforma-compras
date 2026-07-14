import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
