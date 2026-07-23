import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GoogleSheetsConnectionCheck } from '@compras/contracts';
import { google } from 'googleapis';

import { isDemoMode } from '../config/runtime-mode.js';
import { demoSheetWorkbook } from './demo-sheet.workbook.js';
import { normalizeText } from './sheet-sync.parser.js';
import type { StoredGoogleSheetsIntegration, ConnectorInfo, SheetWorkbook } from './sheet-sync.types.js';

export type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

export const GOOGLE_SHEETS_CLIENT_FACTORY = Symbol('GOOGLE_SHEETS_CLIENT_FACTORY');
export const SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly';

type GoogleSheetsClient = ReturnType<typeof google.sheets>;

export type GoogleSheetsClientFactory = (
  credentials: ServiceAccountCredentials,
  scopes: string[],
) => GoogleSheetsClient;

const MAX_SOURCE_ROWS = 5_000;
const LEGACY_SHEET_NAME = 'valores negociados';

type ResolvedSpreadsheet = {
  title: string;
  requiredSheets: Array<{ configuredName: string; actualName: string }>;
  legacySheetName: string | null;
};

export const createGoogleSheetsClient: GoogleSheetsClientFactory = (
  credentials,
  scopes,
) => {
  const auth = new google.auth.GoogleAuth({ credentials, scopes });
  return google.sheets({ version: 'v4', auth });
};

@Injectable()
export class GoogleSheetsReader {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(GOOGLE_SHEETS_CLIENT_FACTORY)
    private readonly createClient: GoogleSheetsClientFactory,
  ) {}

  connectorInfo(): ConnectorInfo {
    const credentials = this.credentials();
    if (!credentials && isDemoMode(this.config)) {
      return {
        configured: true,
        mode: 'DEMO',
        serviceAccountEmail: null,
      };
    }
    return {
      configured: Boolean(credentials),
      mode: credentials ? 'GOOGLE_SERVICE_ACCOUNT' : 'UNCONFIGURED',
      serviceAccountEmail: credentials?.client_email ?? null,
    };
  }

  async checkConnection(
    integration: StoredGoogleSheetsIntegration,
  ): Promise<GoogleSheetsConnectionCheck> {
    const credentials = this.credentials();
    if (!credentials && isDemoMode(this.config)) {
      const workbook = demoSheetWorkbook(integration);
      const resolved = resolveSpreadsheet(
        workbook.spreadsheetTitle,
        Object.values(workbook.tables).map((table) => table.name),
        integration,
      );
      return connectionCheck(resolved, 'DEMO', null);
    }
    if (!credentials) {
      throw new BadGatewayException(
        'O conector Google Sheets ainda nao foi configurado no servidor.',
      );
    }

    try {
      const sheets = this.createClient(credentials, [SHEETS_READONLY_SCOPE]);
      const resolved = await readSpreadsheetMetadata(sheets, integration);
      return connectionCheck(
        resolved,
        'GOOGLE_SERVICE_ACCOUNT',
        credentials.client_email,
      );
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException(
        'Nao foi possivel validar o acesso a planilha. Confirme a credencial, o compartilhamento como leitor e tente novamente.',
      );
    }
  }

  async readWorkbook(integration: StoredGoogleSheetsIntegration): Promise<SheetWorkbook> {
    const credentials = this.credentials();
    if (!credentials && isDemoMode(this.config)) {
      return demoSheetWorkbook(integration);
    }
    if (!credentials) {
      throw new BadGatewayException(
        'O conector Google Sheets ainda nao foi configurado no servidor.',
      );
    }

    try {
      const sheets = this.createClient(credentials, [SHEETS_READONLY_SCOPE]);
      const resolved = await readSpreadsheetMetadata(sheets, integration);
      const requiredNames = resolved.requiredSheets.map(
        (sheet) => sheet.configuredName,
      );
      const requestedSheets = [
        ...resolved.requiredSheets.map((sheet) => ({
          key: sheet.configuredName,
          actualName: sheet.actualName,
        })),
        ...(resolved.legacySheetName &&
        !requiredNames.some(
          (name) => normalizeText(name) === normalizeText(resolved.legacySheetName ?? ''),
        )
          ? [
              {
                key: resolved.legacySheetName,
                actualName: resolved.legacySheetName,
              },
            ]
          : []),
      ];
      const ranges = requestedSheets.map((sheet) =>
        sheetRange(sheet.actualName, integration.headerRow),
      );
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: integration.spreadsheetId,
        ranges,
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
      const tables: SheetWorkbook['tables'] = {};
      requestedSheets.forEach((sheet, index) => {
        tables[sheet.key] = {
          name: sheet.actualName,
          values: response.data.valueRanges?.[index]?.values ?? [],
        };
      });
      return { spreadsheetTitle: resolved.title, tables };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException(
        'Nao foi possivel ler a planilha. Confirme o compartilhamento com a conta de servico e tente novamente.',
      );
    }
  }

  private credentials(): ServiceAccountCredentials | null {
    const plain = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim();
    const encoded = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64')?.trim();
    if (!plain && !encoded) {
      return null;
    }
    try {
      const raw = plain || Buffer.from(encoded as string, 'base64').toString('utf8');
      const value = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
      if (!value.client_email || !value.private_key) {
        return null;
      }
      return {
        client_email: value.client_email,
        private_key: value.private_key.replace(/\\n/g, '\n'),
        ...(value.project_id && { project_id: value.project_id }),
      };
    } catch {
      return null;
    }
  }
}

async function readSpreadsheetMetadata(
  sheets: GoogleSheetsClient,
  integration: StoredGoogleSheetsIntegration,
): Promise<ResolvedSpreadsheet> {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: integration.spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });
  const title = metadata.data.properties?.title?.trim() || 'Google Sheets';
  const available = (metadata.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((sheetTitle): sheetTitle is string => Boolean(sheetTitle));
  return resolveSpreadsheet(title, available, integration);
}

function resolveSpreadsheet(
  title: string,
  available: string[],
  integration: StoredGoogleSheetsIntegration,
): ResolvedSpreadsheet {
  const requiredNames = [
    integration.itemsSheetName,
    integration.installmentsSheetName,
    integration.suppliersSheetName,
    integration.pricesSheetName,
  ];
  const candidates = requiredNames.map((configuredName) => ({
    configuredName,
    actualName: resolveSheetName(available, configuredName),
  }));
  const missing = candidates
    .filter((sheet) => !sheet.actualName)
    .map((sheet) => sheet.configuredName);
  if (missing.length) {
    throw new BadGatewayException(
      `Abas nao encontradas na planilha: ${missing.join(', ')}.`,
    );
  }
  const mappedNames = candidates.map((sheet) => normalizeText(sheet.actualName ?? ''));
  if (new Set(mappedNames).size !== mappedNames.length) {
    throw new BadGatewayException(
      'Cada fonte obrigatoria deve apontar para uma aba diferente da planilha.',
    );
  }
  return {
    title,
    requiredSheets: candidates.map((sheet) => ({
      configuredName: sheet.configuredName,
      actualName: sheet.actualName as string,
    })),
    legacySheetName: resolveSheetName(available, LEGACY_SHEET_NAME),
  };
}

function connectionCheck(
  resolved: ResolvedSpreadsheet,
  connectorMode: GoogleSheetsConnectionCheck['connectorMode'],
  serviceAccountEmail: string | null,
): GoogleSheetsConnectionCheck {
  return {
    connectorMode,
    spreadsheetTitle: resolved.title,
    serviceAccountEmail,
    requiredSheets: resolved.requiredSheets,
    legacySheetName: resolved.legacySheetName,
    checkedAt: new Date().toISOString(),
  };
}

function sheetRange(sheetName: string, headerRow: number): string {
  const escapedName = sheetName.replaceAll("'", "''");
  return `'${escapedName}'!A${headerRow}:Z${headerRow + MAX_SOURCE_ROWS}`;
}

function resolveSheetName(available: string[], requested: string): string | null {
  const target = normalizeText(requested);
  return available.find((name) => normalizeText(name) === target) ?? null;
}
