import { z } from 'zod';

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

export const googleSheetsIntegrationInputSchema = z.object({
  spreadsheetId: z.string().trim().min(20).max(160).regex(/^[A-Za-z0-9_-]+$/),
  itemsSheetName: z.string().trim().min(1).max(120).default('Itens do Pedido'),
  installmentsSheetName: z.string().trim().min(1).max(120).default('Parcelas do Pedido'),
  suppliersSheetName: z.string().trim().min(1).max(120).default('Cadastro de Fornecedores'),
  pricesSheetName: z.string().trim().min(1).max(120).default('Tabela de Precos Negociados'),
  headerRow: z.number().int().min(1).max(20).default(1),
  enabled: z.boolean().default(true),
});
export type GoogleSheetsIntegrationInput = z.infer<
  typeof googleSheetsIntegrationInputSchema
>;

export const integrationHealthSchema = z.enum(['NEVER_SYNCED', 'HEALTHY', 'ERROR']);
export type IntegrationHealth = z.infer<typeof integrationHealthSchema>;

export const googleSheetsConnectorModeSchema = z.enum([
  'DEMO',
  'GOOGLE_SERVICE_ACCOUNT',
  'UNCONFIGURED',
]);
export type GoogleSheetsConnectorMode = z.infer<typeof googleSheetsConnectorModeSchema>;

export const googleSheetsIntegrationSchema = googleSheetsIntegrationInputSchema.extend({
  id: z.string().uuid(),
  spreadsheetTitle: nullableText(160),
  connectorConfigured: z.boolean(),
  connectorMode: googleSheetsConnectorModeSchema,
  serviceAccountEmail: nullableText(255),
  lastStatus: integrationHealthSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  lastError: nullableText(1_000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GoogleSheetsIntegration = z.infer<typeof googleSheetsIntegrationSchema>;

export const googleSheetsConnectorStatusSchema = z.object({
  configured: z.boolean(),
  mode: googleSheetsConnectorModeSchema,
  serviceAccountEmail: nullableText(255),
  integration: googleSheetsIntegrationSchema.nullable(),
});
export type GoogleSheetsConnectorStatus = z.infer<
  typeof googleSheetsConnectorStatusSchema
>;

export const sheetSyncEntitySchema = z.enum([
  'SUPPLIER',
  'COST_CENTER',
  'PRICE',
  'PURCHASE',
]);
export type SheetSyncEntity = z.infer<typeof sheetSyncEntitySchema>;

export const sheetSyncActionTypeSchema = z.enum([
  'CREATE',
  'UPDATE',
  'ATTACH_INVOICE',
  'SKIP_DUPLICATE',
  'SKIP_OUT_OF_SCOPE',
  'INVALID',
]);
export type SheetSyncActionType = z.infer<typeof sheetSyncActionTypeSchema>;

export const sheetSyncActionSchema = z.object({
  key: z.string().min(1).max(240),
  entity: sheetSyncEntitySchema,
  action: sheetSyncActionTypeSchema,
  rowNumbers: z.array(z.number().int().positive()).max(500),
  label: z.string().min(1).max(300),
  reason: z.string().min(1).max(1_000),
  amount: z.number().finite().nullable(),
});
export type SheetSyncAction = z.infer<typeof sheetSyncActionSchema>;

export const sheetSyncTotalsSchema = z.object({
  sourceRows: z.number().int().nonnegative(),
  ready: z.number().int().nonnegative(),
  updates: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
});
export type SheetSyncTotals = z.infer<typeof sheetSyncTotalsSchema>;

export const sheetSyncPreviewSchema = z.object({
  runId: z.string().uuid(),
  spreadsheetTitle: z.string().min(1).max(160),
  snapshotHash: z.string().length(64),
  actions: z.array(sheetSyncActionSchema).max(5_000),
  totals: sheetSyncTotalsSchema,
  createdAt: z.string().datetime(),
});
export type SheetSyncPreview = z.infer<typeof sheetSyncPreviewSchema>;

export const applySheetSyncInputSchema = z.object({
  runId: z.string().uuid(),
});
export type ApplySheetSyncInput = z.infer<typeof applySheetSyncInputSchema>;

export const sheetWorkbookUploadConstraints = {
  maximumBytes: 10 * 1024 * 1024,
} as const;

export const sheetSyncResultSchema = z.object({
  runId: z.string().uuid(),
  suppliersCreated: z.number().int().nonnegative(),
  suppliersUpdated: z.number().int().nonnegative(),
  costCentersCreated: z.number().int().nonnegative(),
  pricesCreated: z.number().int().nonnegative(),
  pricesUpdated: z.number().int().nonnegative(),
  purchasesCreated: z.number().int().nonnegative(),
  invoicesAttached: z.number().int().nonnegative(),
  duplicatesSkipped: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  completedAt: z.string().datetime(),
});
export type SheetSyncResult = z.infer<typeof sheetSyncResultSchema>;
