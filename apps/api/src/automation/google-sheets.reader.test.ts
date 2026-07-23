import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import {
  GoogleSheetsReader,
  SHEETS_READONLY_SCOPE,
  type GoogleSheetsClientFactory,
  type ServiceAccountCredentials,
} from './google-sheets.reader.js';
import type { StoredGoogleSheetsIntegration } from './sheet-sync.types.js';

describe('GoogleSheetsReader', () => {
  it('checks the credential, sharing and mapped sheets with read-only scope', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        properties: { title: 'Planilha de valores negociados' },
        sheets: availableSheets().map((title) => ({ properties: { title } })),
      },
    });
    const factory = clientFactory(get);
    const reader = new GoogleSheetsReader(config(), factory);

    const result = await reader.checkConnection(integration());

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        client_email: 'reader@example.iam.gserviceaccount.com',
        private_key: 'line-1\nline-2',
      }),
      [SHEETS_READONLY_SCOPE],
    );
    expect(get).toHaveBeenCalledWith({
      spreadsheetId: '1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4',
      fields: 'properties.title,sheets.properties.title',
    });
    expect(result).toMatchObject({
      connectorMode: 'GOOGLE_SERVICE_ACCOUNT',
      spreadsheetTitle: 'Planilha de valores negociados',
      serviceAccountEmail: 'reader@example.iam.gserviceaccount.com',
      legacySheetName: 'valores negociados',
    });
    expect(result.requiredSheets).toEqual([
      { configuredName: 'Itens do Pedido', actualName: 'ITENS DO PEDIDO' },
      { configuredName: 'Parcelas do Pedido', actualName: 'Parcelas do Pedido' },
      {
        configuredName: 'Cadastro de Fornecedores',
        actualName: 'Cadastro de Fornecedores',
      },
      {
        configuredName: 'Tabela de Precos Negociados',
        actualName: 'Tabela de Precos Negociados',
      },
    ]);
  });

  it('reports every required sheet missing from the configured workbook', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        properties: { title: 'Planilha incompleta' },
        sheets: [{ properties: { title: 'Itens do Pedido' } }],
      },
    });
    const reader = new GoogleSheetsReader(config(), clientFactory(get));

    await expect(reader.checkConnection(integration())).rejects.toThrow(
      /Parcelas do Pedido, Cadastro de Fornecedores, Tabela de Precos Negociados/,
    );
  });

  it('rejects two required sources mapped to the same sheet', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        properties: { title: 'Planilha duplicada' },
        sheets: availableSheets().map((title) => ({ properties: { title } })),
      },
    });
    const reader = new GoogleSheetsReader(config(), clientFactory(get));

    await expect(
      reader.checkConnection(
        integration({ installmentsSheetName: 'Itens do Pedido' }),
      ),
    ).rejects.toThrow(/deve apontar para uma aba diferente/);
  });

  it('keeps the full workbook import on the same read-only client', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        properties: { title: 'Planilha de valores negociados' },
        sheets: availableSheets().map((title) => ({ properties: { title } })),
      },
    });
    const batchGet = vi.fn().mockResolvedValue({
      data: {
        valueRanges: availableSheets().map(() => ({ values: [['cabecalho']] })),
      },
    });
    const factory = clientFactory(get, batchGet);
    const reader = new GoogleSheetsReader(config(), factory);

    const workbook = await reader.readWorkbook(integration());

    expect(factory).toHaveBeenCalledWith(expect.any(Object), [SHEETS_READONLY_SCOPE]);
    expect(batchGet).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: '1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4',
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
      }),
    );
    expect(workbook.spreadsheetTitle).toBe('Planilha de valores negociados');
    expect(Object.keys(workbook.tables)).toContain('valores negociados');
  });
});

function config(): ConfigService {
  return new ConfigService({
    DEMO_MODE: 'false',
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'reader@example.iam.gserviceaccount.com',
      private_key: 'line-1\\nline-2',
      project_id: 'compras-test',
    }),
  });
}

function clientFactory(
  get: ReturnType<typeof vi.fn>,
  batchGet: ReturnType<typeof vi.fn> = vi.fn(),
) {
  return vi.fn(
    (_credentials: ServiceAccountCredentials, _scopes: string[]) =>
      ({ spreadsheets: { get, values: { batchGet } } }) as never,
  ) satisfies GoogleSheetsClientFactory;
}

function availableSheets(): string[] {
  return [
    'ITENS DO PEDIDO',
    'Parcelas do Pedido',
    'Cadastro de Fornecedores',
    'Tabela de Precos Negociados',
    'valores negociados',
  ];
}

function integration(
  overrides: Partial<StoredGoogleSheetsIntegration> = {},
): StoredGoogleSheetsIntegration {
  return {
    id: '93000000-0000-4000-8000-000000000001',
    spreadsheetId: '1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4',
    spreadsheetTitle: null,
    itemsSheetName: 'Itens do Pedido',
    installmentsSheetName: 'Parcelas do Pedido',
    suppliersSheetName: 'Cadastro de Fornecedores',
    pricesSheetName: 'Tabela de Precos Negociados',
    headerRow: 1,
    enabled: true,
    lastStatus: 'NEVER_SYNCED',
    lastSyncedAt: null,
    lastError: null,
    createdAt: '2026-07-22T20:00:00.000Z',
    updatedAt: '2026-07-22T20:00:00.000Z',
    ...overrides,
  };
}
