import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { InvoiceDocumentStorage } from './invoice-document.storage.js';
import { InvoiceDocumentsController } from './invoice-documents.controller.js';
import { InvoiceDocumentsService } from './invoice-documents.service.js';
import { InvoicePdfParser } from './invoice-pdf.parser.js';
import { OcrEngine } from './ocr-engine.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [InvoiceDocumentsController],
  providers: [
    InvoiceDocumentStorage,
    InvoiceDocumentsService,
    InvoicePdfParser,
    OcrEngine,
  ],
})
export class InvoiceDocumentsModule {}
