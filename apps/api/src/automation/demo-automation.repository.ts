import { randomUUID } from 'node:crypto';

import type { SheetSyncResult } from '@compras/contracts';

import { HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { AutomationRepository } from './automation.repository.js';
import type {
  CreateSheetSyncRunInput,
  StoredGoogleSheetsIntegration,
  StoredSheetSyncRun,
  UpsertSheetIntegrationInput,
} from './sheet-sync.types.js';

const HUMAN_CLINIC_INTEGRATION_ID = '81000000-0000-4000-8000-000000000001';
const INITIAL_DATE = '2026-07-14T12:00:00.000Z';

export class DemoAutomationRepository extends AutomationRepository {
  private readonly integrations = new Map<string, StoredGoogleSheetsIntegration>([
    [
      HUMAN_CLINIC_ID,
      {
        id: HUMAN_CLINIC_INTEGRATION_ID,
        spreadsheetId: '1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4',
        spreadsheetTitle: 'Planilha de valores negociados',
        itemsSheetName: 'Itens do Pedido',
        installmentsSheetName: 'Parcelas do Pedido',
        suppliersSheetName: 'Cadastro de Fornecedores',
        pricesSheetName: 'Tabela de Precos Negociados',
        headerRow: 1,
        enabled: true,
        lastStatus: 'NEVER_SYNCED',
        lastSyncedAt: null,
        lastError: null,
        createdAt: INITIAL_DATE,
        updatedAt: INITIAL_DATE,
      },
    ],
  ]);
  private readonly runs = new Map<string, StoredSheetSyncRun>();

  async getGoogleSheetsIntegration(
    organizationId: string,
  ): Promise<StoredGoogleSheetsIntegration | null> {
    const integration = this.integrations.get(organizationId);
    return integration ? structuredClone(integration) : null;
  }

  async upsertGoogleSheetsIntegration(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpsertSheetIntegrationInput,
  ): Promise<StoredGoogleSheetsIntegration> {
    const existing = this.integrations.get(organizationId);
    const now = new Date().toISOString();
    const integration: StoredGoogleSheetsIntegration = {
      id: existing?.id ?? randomUUID(),
      spreadsheetId: input.spreadsheetId,
      spreadsheetTitle: input.spreadsheetTitle ?? existing?.spreadsheetTitle ?? null,
      itemsSheetName: input.itemsSheetName,
      installmentsSheetName: input.installmentsSheetName,
      suppliersSheetName: input.suppliersSheetName,
      pricesSheetName: input.pricesSheetName,
      headerRow: input.headerRow,
      enabled: input.enabled,
      lastStatus: existing?.lastStatus ?? 'NEVER_SYNCED',
      lastSyncedAt: existing?.lastSyncedAt ?? null,
      lastError: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.integrations.set(organizationId, integration);
    return structuredClone(integration);
  }

  async createSheetSyncRun(input: CreateSheetSyncRunInput): Promise<StoredSheetSyncRun> {
    const id = randomUUID();
    const run: StoredSheetSyncRun = {
      id,
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      status: 'PREVIEWED',
      snapshotHash: input.snapshotHash,
      sourceRowCount: input.payload.sourceRows,
      preview: { ...input.preview, runId: id },
      payload: structuredClone(input.payload),
      result: null,
      error: null,
      createdAt: input.preview.createdAt,
      appliedAt: null,
    };
    this.runs.set(id, run);
    return structuredClone(run);
  }

  async getSheetSyncRun(
    organizationId: string,
    runId: string,
  ): Promise<StoredSheetSyncRun | null> {
    const run = this.runs.get(runId);
    return run?.organizationId === organizationId ? structuredClone(run) : null;
  }

  async claimSheetSyncRun(organizationId: string, runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.organizationId !== organizationId || run.status !== 'PREVIEWED') {
      return false;
    }
    run.status = 'APPLYING';
    return true;
  }

  async markSheetSyncApplied(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    runId: string,
    result: SheetSyncResult,
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run || run.organizationId !== organizationId) return;
    run.status = 'APPLIED';
    run.result = structuredClone(result);
    run.appliedAt = result.completedAt;
    const integration = this.integrations.get(organizationId);
    if (integration) {
      integration.lastStatus = 'HEALTHY';
      integration.lastSyncedAt = result.completedAt;
      integration.lastError = null;
      integration.updatedAt = result.completedAt;
    }
  }

  async markSheetSyncFailed(
    organizationId: string,
    runId: string,
    message: string,
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (run?.organizationId === organizationId) {
      run.status = 'FAILED';
      run.error = message;
    }
    const integration = this.integrations.get(organizationId);
    if (integration) {
      integration.lastStatus = 'ERROR';
      integration.lastError = message;
      integration.updatedAt = new Date().toISOString();
    }
  }
}
