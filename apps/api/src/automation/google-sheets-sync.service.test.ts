import { describe, expect, it, vi } from 'vitest';

import type {
  GoogleSheetsConnectionCheck,
  PurchaseSummary,
  Supplier,
} from '@compras/contracts';

import {
  GoogleSheetsSyncService,
  planSheetSync,
} from './google-sheets-sync.service.js';
import type { ParsedSheetPayload } from './sheet-sync.types.js';

const supplier: Supplier = {
  id: '51000000-0000-4000-8000-000000000001',
  legalName: 'Fornecedor Teste LTDA',
  tradeName: null,
  document: '43043093000144',
  category: null,
  operationNature: null,
  paymentMethod: null,
  pixKeyType: null,
  pixKey: null,
  pixBeneficiaryName: null,
  pixBeneficiaryDocument: null,
  paymentLink: null,
  defaultCostCenterId: null,
  defaultCostCenterName: null,
  email: null,
  phone: null,
  postalCode: null,
  street: null,
  addressNumber: null,
  addressComplement: null,
  district: null,
  city: null,
  state: null,
  registrationStatus: null,
  primaryActivity: null,
  status: 'ACTIVE',
  notes: null,
  priceCount: 0,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
};

describe('Google Sheets reconciliation', () => {
  it('checks access without creating a synchronization preview', async () => {
    const integration = { id: 'integration-id' };
    const check: GoogleSheetsConnectionCheck = {
      connectorMode: 'DEMO',
      spreadsheetTitle: 'Planilha de valores negociados',
      serviceAccountEmail: null,
      requiredSheets: [
        { configuredName: 'Itens', actualName: 'Itens' },
        { configuredName: 'Parcelas', actualName: 'Parcelas' },
        { configuredName: 'Fornecedores', actualName: 'Fornecedores' },
        { configuredName: 'Precos', actualName: 'Precos' },
      ],
      legacySheetName: null,
      checkedAt: '2026-07-22T20:00:00.000Z',
    };
    const createSheetSyncRun = vi.fn();
    const automation = {
      getGoogleSheetsIntegration: vi.fn().mockResolvedValue(integration),
      createSheetSyncRun,
    };
    const reader = { checkConnection: vi.fn().mockResolvedValue(check) };
    const service = new GoogleSheetsSyncService(
      automation as never,
      {} as never,
      reader as never,
    );

    await expect(service.checkConnection('organization-id')).resolves.toEqual(check);
    expect(reader.checkConnection).toHaveBeenCalledWith(integration);
    expect(createSheetSyncRun).not.toHaveBeenCalled();
  });

  it('attaches a missing invoice when supplier and amount match an existing purchase', () => {
    const planned = planSheetSync(payload(), [], [supplier], [], [existingPurchase()]);
    expect(planned.actions).toContainEqual(
      expect.objectContaining({
        key: 'purchase:ped novo',
        action: 'ATTACH_INVOICE',
      }),
    );
    expect(planned.operations).toContainEqual(
      expect.objectContaining({
        key: 'purchase:ped novo',
        targetId: '71000000-0000-4000-8000-000000000001',
      }),
    );
  });

  it('requires review when supplier and amount match more than one purchase', () => {
    const second = {
      ...existingPurchase(),
      id: '71000000-0000-4000-8000-000000000002',
      number: 'LEGACY-2',
    };
    const planned = planSheetSync(payload(), [], [supplier], [], [existingPurchase(), second]);
    expect(planned.actions).toContainEqual(
      expect.objectContaining({ key: 'purchase:ped novo', action: 'INVALID' }),
    );
  });

  it('treats legal and trade names as the same supplier after identity resolution', () => {
    const sameOrder = {
      ...existingPurchase(),
      number: 'PED-NOVO',
      supplierName: 'Fornecedor Teste',
      invoiceNumber: '170',
    };
    const planned = planSheetSync(payload(), [], [supplier], [], [sameOrder]);
    expect(planned.actions).toContainEqual(
      expect.objectContaining({ key: 'purchase:ped novo', action: 'SKIP_DUPLICATE' }),
    );
  });
});

function payload(): ParsedSheetPayload {
  return {
    sourceRows: 1,
    suppliers: [],
    prices: [],
    issues: [],
    warnings: [],
    purchases: [
      {
        sourceKey: 'ped novo',
        rowNumbers: [2],
        number: 'PED-NOVO',
        invoiceNumber: '170',
        issuedAt: '2026-07-14',
        supplierName: 'Fornecedor Teste LTDA',
        supplierDocument: '43043093000144',
        category: 'Servicos',
        operationNature: null,
        paymentMethod: null,
        notes: null,
        items: [
          {
            rowNumber: 2,
            description: 'Servico contratado',
            quantity: 1,
            unit: null,
            unitPrice: 600,
            negotiatedPrice: 600,
            costCenterName: null,
          },
        ],
        installments: [],
      },
    ],
  };
}

function existingPurchase(): PurchaseSummary {
  return {
    id: '71000000-0000-4000-8000-000000000001',
    displayNumber: 1,
    number: 'LEGACY-1',
    invoiceNumber: null,
    fiscalDocumentRequired: true,
    supplierId: supplier.id,
    supplierName: supplier.legalName,
    issuedAt: '2026-07-10',
    status: 'REGISTERED',
    workflowStage: 'PURCHASE_ORDER',
    invoiceLinked: false,
    approval: null,
    category: 'Servicos',
    paymentMethod: null,
    total: 600,
    negotiatedSavings: 0,
    departments: [],
    itemCount: 1,
    source: 'MANUAL',
    sourceReference: null,
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
  };
}
