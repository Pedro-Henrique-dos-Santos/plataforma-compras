import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import { DemoProcurementRepository } from './demo-procurement.repository.js';
import { PrismaProcurementRepository } from './prisma-procurement.repository.js';
import { ProcurementRepository } from './procurement.repository.js';

export const procurementRepositoryProvider: Provider = {
  provide: ProcurementRepository,
  inject: [ConfigService, DatabaseService],
  useFactory: (config: ConfigService, database: DatabaseService): ProcurementRepository =>
    isDemoMode(config)
      ? new DemoProcurementRepository()
      : new PrismaProcurementRepository(database.prisma),
};
