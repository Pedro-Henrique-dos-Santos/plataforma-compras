import type {
  GoogleSheetsIntegration,
  GoogleSheetsIntegrationInput,
  SheetSyncAction,
  SheetSyncPreview,
  SheetSyncResult,
} from '@compras/contracts';

export type SheetTable = {
  name: string;
  values: unknown[][];
};

export type SheetWorkbook = {
  spreadsheetTitle: string;
  tables: Record<string, SheetTable>;
};

export type ParsedSheetSupplier = {
  sourceKey: string;
  rowNumber: number;
  externalId: string | null;
  document: string | null;
  legalName: string;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  operationNature: string | null;
  paymentMethod: string | null;
  costCenterName: string | null;
  notes: string | null;
  active: boolean;
};

export type ParsedSheetPrice = {
  sourceKey: string;
  rowNumber: number;
  supplierName: string;
  supplierDocument: string | null;
  itemCode: string | null;
  description: string;
  unit: string | null;
  initialPrice: number | null;
  negotiatedPrice: number;
  category: string | null;
  costCenterName: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  active: boolean;
};

export type ParsedSheetPurchaseItem = {
  rowNumber: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  negotiatedPrice: number | null;
  costCenterName: string | null;
};

export type ParsedSheetInstallment = {
  rowNumber: number;
  dueDate: string;
  amount: number;
};

export type ParsedSheetPurchase = {
  sourceKey: string;
  rowNumbers: number[];
  number: string;
  invoiceNumber: string | null;
  issuedAt: string | null;
  supplierName: string;
  supplierDocument: string | null;
  category: string | null;
  operationNature: string | null;
  paymentMethod: string | null;
  notes: string | null;
  items: ParsedSheetPurchaseItem[];
  installments: ParsedSheetInstallment[];
};

export type ParsedSheetPayload = {
  sourceRows: number;
  suppliers: ParsedSheetSupplier[];
  prices: ParsedSheetPrice[];
  purchases: ParsedSheetPurchase[];
  issues: SheetSyncAction[];
  warnings: string[];
};

export type PlannedSheetOperation = {
  key: string;
  action: SheetSyncAction['action'];
  targetId?: string;
};

export type SheetSyncPayload = ParsedSheetPayload & {
  actions: SheetSyncAction[];
  operations: PlannedSheetOperation[];
};

export type StoredGoogleSheetsIntegration = Omit<
  GoogleSheetsIntegration,
  'connectorConfigured' | 'connectorMode' | 'serviceAccountEmail'
>;

export type StoredSheetSyncRun = {
  id: string;
  organizationId: string;
  integrationId: string;
  status: 'PREVIEWED' | 'APPLYING' | 'APPLIED' | 'FAILED';
  snapshotHash: string;
  sourceRowCount: number;
  preview: SheetSyncPreview;
  payload: SheetSyncPayload;
  result: SheetSyncResult | null;
  error: string | null;
  createdAt: string;
  appliedAt: string | null;
};

export type CreateSheetSyncRunInput = {
  actorId: string;
  organizationId: string;
  integrationId: string;
  snapshotHash: string;
  payload: SheetSyncPayload;
  preview: Omit<SheetSyncPreview, 'runId'>;
};

export type ConnectorInfo = {
  configured: boolean;
  mode: 'DEMO' | 'GOOGLE_SERVICE_ACCOUNT' | 'UNCONFIGURED';
  serviceAccountEmail: string | null;
};

export type UpsertSheetIntegrationInput = GoogleSheetsIntegrationInput & {
  spreadsheetTitle?: string | null;
};
