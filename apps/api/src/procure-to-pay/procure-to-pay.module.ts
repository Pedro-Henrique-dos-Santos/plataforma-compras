import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { ProcureToPayController } from './procure-to-pay.controller.js';
import { ProcureToPayService } from './procure-to-pay.service.js';
import { ProcureToPayStorage } from './procure-to-pay.storage.js';
import { CredentialCipher } from './credential-cipher.js';
import { SefazNfeClient } from './sefaz-nfe.client.js';
import { FiscalSyncWorkerService } from './fiscal-sync-worker.service.js';

@Module({
  imports: [IdentityModule, AccessModule, PersistenceModule],
  controllers: [ProcureToPayController],
  providers: [
    CredentialCipher,
    FiscalSyncWorkerService,
    ProcureToPayService,
    ProcureToPayStorage,
    SefazNfeClient,
  ],
  exports: [ProcureToPayService],
})
export class ProcureToPayModule {}
