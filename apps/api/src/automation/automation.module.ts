import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module.js';
import { IdentityModule } from '../auth/identity.module.js';
import { GoogleSheetsController } from './google-sheets.controller.js';
import { GoogleSheetsReader } from './google-sheets.reader.js';
import { GoogleSheetsSyncService } from './google-sheets-sync.service.js';

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [GoogleSheetsController],
  providers: [GoogleSheetsReader, GoogleSheetsSyncService],
})
export class AutomationModule {}
