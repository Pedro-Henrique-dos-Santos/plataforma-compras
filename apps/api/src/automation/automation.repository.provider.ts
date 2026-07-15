import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import { AutomationRepository } from './automation.repository.js';
import { DemoAutomationRepository } from './demo-automation.repository.js';
import { PrismaAutomationRepository } from './prisma-automation.repository.js';

export const automationRepositoryProvider: Provider = {
  provide: AutomationRepository,
  inject: [ConfigService, DatabaseService],
  useFactory: (config: ConfigService, database: DatabaseService): AutomationRepository =>
    isDemoMode(config)
      ? new DemoAutomationRepository()
      : new PrismaAutomationRepository(database.prisma),
};
