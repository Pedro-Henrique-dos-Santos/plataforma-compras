import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { CostCentersController } from './cost-centers.controller.js';
import { MasterDataService } from './master-data.service.js';
import { SupplierPricesController } from './supplier-prices.controller.js';
import { SuppliersController } from './suppliers.controller.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [CostCentersController, SuppliersController, SupplierPricesController],
  providers: [MasterDataService],
})
export class MasterDataModule {}
