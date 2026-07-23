import { Global, Module } from '@nestjs/common';

import { AutomationRepository } from '../automation/automation.repository.js';
import { automationRepositoryProvider } from '../automation/automation.repository.provider.js';
import { DatabaseModule } from '../database/database.module.js';
import { InvoiceDocumentsRepository } from '../invoices/invoice-documents.repository.js';
import { invoiceDocumentsRepositoryProvider } from '../invoices/invoice-documents.repository.provider.js';
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
    invoiceDocumentsRepositoryProvider,
  ],
  exports: [
    OrganizationsRepository,
    ProcurementRepository,
    AutomationRepository,
    InvoiceDocumentsRepository,
  ],
})
export class PersistenceModule {}
