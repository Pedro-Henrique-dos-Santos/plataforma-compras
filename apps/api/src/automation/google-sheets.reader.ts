import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

import { isDemoMode } from '../config/runtime-mode.js';
import { demoSheetWorkbook } from './demo-sheet.workbook.js';
import { normalizeText } from './sheet-sync.parser.js';
import type { StoredGoogleSheetsIntegration, ConnectorInfo, SheetWorkbook } from './sheet-sync.types.js';

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const MAX_SOURCE_ROWS = 5_000;
const LEGACY_SHEET_NAME = 'valores negociados';

@Injectable()
export class GoogleSheetsReader {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

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
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [SHEETS_SCOPE],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId: integration.spreadsheetId,
        fields: 'properties.title,sheets.properties.title',
      });
      const title = metadata.data.properties?.title?.trim() || 'Google Sheets';
      const available =
        (metadata.data.sheets ?? [])
          .map((sheet) => sheet.properties?.title)
          .filter((sheetTitle): sheetTitle is string => Boolean(sheetTitle));
      const requiredNames = [
        integration.itemsSheetName,
        integration.installmentsSheetName,
        integration.suppliersSheetName,
        integration.pricesSheetName,
      ];
      const requiredSheets = requiredNames.map((configuredName) => ({
        configuredName,
        actualName: resolveSheetName(available, configuredName),
      }));
      const missing = requiredSheets
        .filter((sheet) => !sheet.actualName)
        .map((sheet) => sheet.configuredName);
      if (missing.length) {
        throw new BadGatewayException(
          `Abas nao encontradas na planilha: ${missing.join(', ')}.`,
        );
      }

      const legacyName = resolveSheetName(available, LEGACY_SHEET_NAME);
      const requestedSheets = [
        ...requiredSheets.map((sheet) => ({
          key: sheet.configuredName,
          actualName: sheet.actualName as string,
        })),
        ...(legacyName && !requiredNames.some((name) => normalizeText(name) === normalizeText(legacyName))
          ? [{ key: legacyName, actualName: legacyName }]
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
      return { spreadsheetTitle: title, tables };
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

function sheetRange(sheetName: string, headerRow: number): string {
  const escapedName = sheetName.replaceAll("'", "''");
  return `'${escapedName}'!A${headerRow}:Z${headerRow + MAX_SOURCE_ROWS}`;
}

function resolveSheetName(available: string[], requested: string): string | null {
  const target = normalizeText(requested);
  return available.find((name) => normalizeText(name) === target) ?? null;
}
