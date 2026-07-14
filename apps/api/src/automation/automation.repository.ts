import type { SheetSyncResult } from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import type {
  CreateSheetSyncRunInput,
  StoredGoogleSheetsIntegration,
  StoredSheetSyncRun,
  UpsertSheetIntegrationInput,
} from './sheet-sync.types.js';

export abstract class AutomationRepository {
  abstract getGoogleSheetsIntegration(
    organizationId: string,
  ): Promise<StoredGoogleSheetsIntegration | null>;

  abstract upsertGoogleSheetsIntegration(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpsertSheetIntegrationInput,
  ): Promise<StoredGoogleSheetsIntegration>;

  abstract createSheetSyncRun(input: CreateSheetSyncRunInput): Promise<StoredSheetSyncRun>;

  abstract getSheetSyncRun(
    organizationId: string,
    runId: string,
  ): Promise<StoredSheetSyncRun | null>;

  abstract claimSheetSyncRun(organizationId: string, runId: string): Promise<boolean>;

  abstract markSheetSyncApplied(
    actor: AuthenticatedIdentity,
    organizationId: string,
    runId: string,
    result: SheetSyncResult,
  ): Promise<void>;

  abstract markSheetSyncFailed(
    organizationId: string,
    runId: string,
    message: string,
  ): Promise<void>;
}
