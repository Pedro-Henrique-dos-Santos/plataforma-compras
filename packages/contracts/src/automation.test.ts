import { describe, expect, it } from 'vitest';

import { googleSheetsConnectionCheckSchema } from './automation.js';

describe('Google Sheets connection check contract', () => {
  it('accepts a verified read-only mapping', () => {
    const result = googleSheetsConnectionCheckSchema.parse({
      connectorMode: 'GOOGLE_SERVICE_ACCOUNT',
      spreadsheetTitle: 'Planilha de valores negociados',
      serviceAccountEmail: 'compras-reader@example.iam.gserviceaccount.com',
      requiredSheets: [
        { configuredName: 'Itens do Pedido', actualName: 'Itens do Pedido' },
        { configuredName: 'Parcelas do Pedido', actualName: 'Parcelas do Pedido' },
        {
          configuredName: 'Cadastro de Fornecedores',
          actualName: 'Cadastro de Fornecedores',
        },
        {
          configuredName: 'Tabela de Precos Negociados',
          actualName: 'Tabela de Precos Negociados',
        },
      ],
      legacySheetName: 'valores negociados',
      checkedAt: '2026-07-22T20:00:00.000Z',
    });

    expect(result.requiredSheets).toHaveLength(4);
  });

  it('rejects an unconfigured connector and incomplete mappings', () => {
    expect(() =>
      googleSheetsConnectionCheckSchema.parse({
        connectorMode: 'UNCONFIGURED',
        spreadsheetTitle: 'Planilha',
        serviceAccountEmail: null,
        requiredSheets: [],
        legacySheetName: null,
        checkedAt: '2026-07-22T20:00:00.000Z',
      }),
    ).toThrow();
  });
});
