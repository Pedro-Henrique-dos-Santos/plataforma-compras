import { Global, Module } from '@nestjs/common';

import { AutomationRepository } from '../automation/automation.repository.js';
import { automationRepositoryProvider } from '../automation/automation.repository.provider.js';
import { DatabaseModule } from '../database/database.module.js';
import { OrganizationsRepository } from '../organizations/organizations.repository.js';
import { organizationsRepositoryProvider } from '../organizations/organizations.repository.provider.js';
import { ProcurementRepository } from '../procurement/procurement.repository.js';
import { procurementRepositoryProvider } from '../procurement/procurement.repository.provider.js';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    organizationsRepositoryProvider,
    procurementRepositoryProvider,
    automationRepositoryProvider,
  ],
  exports: [OrganizationsRepository, ProcurementRepository, AutomationRepository],
})
export class PersistenceModule {}
