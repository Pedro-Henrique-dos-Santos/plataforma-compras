import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import { DemoReceivablesRepository } from './demo-receivables.repository.js';
import { PrismaReceivablesRepository } from './prisma-receivables.repository.js';
import { ReceivablesRepository } from './receivables.repository.js';

export const receivablesRepositoryProvider: Provider = {
  provide: ReceivablesRepository,
  inject: [ConfigService, DatabaseService],
  useFactory: (config: ConfigService, database: DatabaseService) =>
    isDemoMode(config)
      ? new DemoReceivablesRepository()
      : new PrismaReceivablesRepository(database.prisma),
};
