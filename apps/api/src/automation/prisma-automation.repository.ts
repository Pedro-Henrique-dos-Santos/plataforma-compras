import { randomUUID } from 'node:crypto';

import type { SheetSyncResult } from '@compras/contracts';
import { Prisma, type PrismaClient } from '@compras/database';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { AutomationRepository } from './automation.repository.js';
import type {
  CreateSheetSyncRunInput,
  StoredGoogleSheetsIntegration,
  StoredSheetSyncRun,
  UpsertSheetIntegrationInput,
} from './sheet-sync.types.js';

export class PrismaAutomationRepository extends AutomationRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async getGoogleSheetsIntegration(
    organizationId: string,
  ): Promise<StoredGoogleSheetsIntegration | null> {
    const integration = await this.prisma.googleSheetsIntegration.findUnique({
      where: { organizationId },
    });
    return integration ? toIntegration(integration) : null;
  }

  async upsertGoogleSheetsIntegration(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpsertSheetIntegrationInput,
  ): Promise<StoredGoogleSheetsIntegration> {
    const integration = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.googleSheetsIntegration.upsert({
        where: { organizationId },
        create: {
          organizationId,
          spreadsheetId: input.spreadsheetId,
          spreadsheetTitle: input.spreadsheetTitle ?? null,
          itemsSheetName: input.itemsSheetName,
          installmentsSheetName: input.installmentsSheetName,
          suppliersSheetName: input.suppliersSheetName,
          pricesSheetName: input.pricesSheetName,
          headerRow: input.headerRow,
          enabled: input.enabled,
        },
        update: {
          spreadsheetId: input.spreadsheetId,
          spreadsheetTitle: input.spreadsheetTitle,
          itemsSheetName: input.itemsSheetName,
          installmentsSheetName: input.installmentsSheetName,
          suppliersSheetName: input.suppliersSheetName,
          pricesSheetName: input.pricesSheetName,
          headerRow: input.headerRow,
          enabled: input.enabled,
          lastError: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'google_sheets_integration',
          resourceId: saved.id,
          metadata: {
            spreadsheetId: input.spreadsheetId,
            itemsSheetName: input.itemsSheetName,
          },
        },
      });
      return saved;
    });
    return toIntegration(integration);
  }

  async createSheetSyncRun(input: CreateSheetSyncRunInput): Promise<StoredSheetSyncRun> {
    const id = randomUUID();
    const preview = { ...input.preview, runId: id };
    const run = await this.prisma.sheetSyncRun.create({
      data: {
        id,
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        createdById: input.actorId,
        snapshotHash: input.snapshotHash,
        sourceRowCount: input.payload.sourceRows,
        preview: preview as unknown as Prisma.InputJsonValue,
        payload: input.payload as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      id: run.id,
      organizationId: run.organizationId,
      integrationId: run.integrationId,
      status: run.status,
      snapshotHash: run.snapshotHash,
      sourceRowCount: run.sourceRowCount,
      preview,
      payload: input.payload,
      result: null,
      error: null,
      createdAt: run.createdAt.toISOString(),
      appliedAt: null,
    };
  }

  async getSheetSyncRun(
    organizationId: string,
    runId: string,
  ): Promise<StoredSheetSyncRun | null> {
    const run = await this.prisma.sheetSyncRun.findFirst({
      where: { id: runId, organizationId },
    });
    if (!run) return null;
    return {
      id: run.id,
      organizationId: run.organizationId,
      integrationId: run.integrationId,
      status: run.status,
      snapshotHash: run.snapshotHash,
      sourceRowCount: run.sourceRowCount,
      preview: run.preview as unknown as StoredSheetSyncRun['preview'],
      payload: run.payload as unknown as StoredSheetSyncRun['payload'],
      result: run.result as unknown as SheetSyncResult | null,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      appliedAt: run.appliedAt?.toISOString() ?? null,
    };
  }

  async claimSheetSyncRun(organizationId: string, runId: string): Promise<boolean> {
    const claimed = await this.prisma.sheetSyncRun.updateMany({
      where: { id: runId, organizationId, status: 'PREVIEWED' },
      data: { status: 'APPLYING' },
    });
    return claimed.count === 1;
  }

  async markSheetSyncApplied(
    actor: AuthenticatedIdentity,
    organizationId: string,
    runId: string,
    result: SheetSyncResult,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const run = await transaction.sheetSyncRun.update({
        where: { id: runId },
        data: {
          status: 'APPLIED',
          result: result as unknown as Prisma.InputJsonValue,
          error: null,
          appliedAt: new Date(result.completedAt),
        },
      });
      await transaction.googleSheetsIntegration.update({
        where: { id: run.integrationId },
        data: {
          lastStatus: 'HEALTHY',
          lastSyncedAt: new Date(result.completedAt),
          lastError: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'IMPORT',
          resource: 'google_sheets_sync',
          resourceId: runId,
          metadata: result as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  async markSheetSyncFailed(
    organizationId: string,
    runId: string,
    message: string,
  ): Promise<void> {
    const run = await this.prisma.sheetSyncRun.findFirst({
      where: { id: runId, organizationId },
      select: { integrationId: true },
    });
    if (!run) return;
    await this.prisma.$transaction([
      this.prisma.sheetSyncRun.update({
        where: { id: runId },
        data: { status: 'FAILED', error: message },
      }),
      this.prisma.googleSheetsIntegration.update({
        where: { id: run.integrationId },
        data: { lastStatus: 'ERROR', lastError: message },
      }),
    ]);
  }
}

function toIntegration(
  integration: Prisma.GoogleSheetsIntegrationGetPayload<Record<string, never>>,
): StoredGoogleSheetsIntegration {
  return {
    id: integration.id,
    spreadsheetId: integration.spreadsheetId,
    spreadsheetTitle: integration.spreadsheetTitle,
    itemsSheetName: integration.itemsSheetName,
    installmentsSheetName: integration.installmentsSheetName,
    suppliersSheetName: integration.suppliersSheetName,
    pricesSheetName: integration.pricesSheetName,
    headerRow: integration.headerRow,
    enabled: integration.enabled,
    lastStatus: integration.lastStatus,
    lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
    lastError: integration.lastError,
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  };
}
