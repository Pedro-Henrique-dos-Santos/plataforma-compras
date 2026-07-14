import { Global, Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { OrganizationsRepository } from '../organizations/organizations.repository.js';
import { organizationsRepositoryProvider } from '../organizations/organizations.repository.provider.js';
import { ProcurementRepository } from '../procurement/procurement.repository.js';
import { procurementRepositoryProvider } from '../procurement/procurement.repository.provider.js';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [organizationsRepositoryProvider, procurementRepositoryProvider],
  exports: [OrganizationsRepository, ProcurementRepository],
})
export class PersistenceModule {}
