import { describe, expect, it } from 'vitest';

import { connectionCheckMessage } from './IntegrationsView';

describe('Google Sheets connection feedback', () => {
  it('summarizes the verified workbook without implying that data was imported', () => {
    expect(
      connectionCheckMessage({
        connectorMode: 'GOOGLE_SERVICE_ACCOUNT',
        spreadsheetTitle: 'Planilha de valores negociados',
        serviceAccountEmail: 'reader@example.iam.gserviceaccount.com',
        requiredSheets: [
          { configuredName: 'Itens', actualName: 'Itens' },
          { configuredName: 'Parcelas', actualName: 'Parcelas' },
          { configuredName: 'Fornecedores', actualName: 'Fornecedores' },
          { configuredName: 'Precos', actualName: 'Precos' },
        ],
        legacySheetName: 'valores negociados',
        checkedAt: '2026-07-22T20:00:00.000Z',
      }),
    ).toBe(
      'Acesso confirmado a Planilha de valores negociados: 4 abas obrigatorias e historico legado.',
    );
  });
});
