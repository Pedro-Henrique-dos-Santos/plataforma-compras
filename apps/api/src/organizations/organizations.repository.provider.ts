import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import { DemoOrganizationsRepository } from './demo-organizations.repository.js';
import { OrganizationsRepository } from './organizations.repository.js';
import { PrismaOrganizationsRepository } from './prisma-organizations.repository.js';

export const organizationsRepositoryProvider: Provider = {
  provide: OrganizationsRepository,
  inject: [ConfigService, DatabaseService],
  useFactory: (config: ConfigService, database: DatabaseService): OrganizationsRepository => {
    return isDemoMode(config)
      ? new DemoOrganizationsRepository()
      : new PrismaOrganizationsRepository(database.prisma);
  },
};
