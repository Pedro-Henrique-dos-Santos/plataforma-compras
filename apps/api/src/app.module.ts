import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthController } from './health/health.controller.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { validateEnvironment } from './config/environment.js';
import { PersistenceModule } from './persistence/persistence.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PersistenceModule,
    OrganizationsModule,
    AuthModule,
    AccessModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
