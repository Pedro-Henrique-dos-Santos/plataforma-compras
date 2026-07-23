import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import { DemoInvoiceDocumentsRepository } from './demo-invoice-documents.repository.js';
import { InvoiceDocumentsRepository } from './invoice-documents.repository.js';
import { PrismaInvoiceDocumentsRepository } from './prisma-invoice-documents.repository.js';

export const invoiceDocumentsRepositoryProvider: Provider = {
  provide: InvoiceDocumentsRepository,
  inject: [ConfigService, DatabaseService],
  useFactory: (
    config: ConfigService,
    database: DatabaseService,
  ): InvoiceDocumentsRepository =>
    isDemoMode(config)
      ? new DemoInvoiceDocumentsRepository()
      : new PrismaInvoiceDocumentsRepository(database.prisma),
};
