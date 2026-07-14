import { Global, Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { OrganizationsRepository } from '../organizations/organizations.repository.js';
import { organizationsRepositoryProvider } from '../organizations/organizations.repository.provider.js';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [organizationsRepositoryProvider],
  exports: [OrganizationsRepository],
})
export class PersistenceModule {}
