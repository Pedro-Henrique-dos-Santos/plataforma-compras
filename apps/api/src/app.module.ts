import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AccessModule } from './access/access.module.js';
import { AutomationModule } from './automation/automation.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthController } from './health/health.controller.js';
import { InvoiceDocumentsModule } from './invoices/invoice-documents.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { validateEnvironment } from './config/environment.js';
import { PersistenceModule } from './persistence/persistence.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';

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
    AutomationModule,
    InvoiceDocumentsModule,
    DashboardModule,
    MasterDataModule,
    PurchasesModule,
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
