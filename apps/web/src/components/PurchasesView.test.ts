import type { PurchaseDetail } from '@compras/contracts';
import { describe, expect, it } from 'vitest';

import {
  approvedByLabel,
  purchaseDetailToEditor,
  purchaseNegotiationMetrics,
  shouldOpenPurchaseOnDoubleClick,
} from './PurchasesView';

describe('purchase detail editor', () => {
  it('preserves historical nullable fields, allocations and installments', () => {
    const detail: PurchaseDetail = {
      id: '10000000-0000-4000-8000-000000000001',
      displayNumber: 42,
      number: 'PED-1042',
      invoiceNumber: 'NF-7788',
      fiscalDocumentRequired: true,
      supplierId: '20000000-0000-4000-8000-000000000001',
      supplierName: 'Fornecedor de teste',
      issuedAt: null,
      status: 'REGISTERED',
      workflowStage: 'SUPPLIER_INVOICED',
      invoiceLinked: true,
      approval: null,
      stageHistory: [],
      category: 'Materiais',
      operationNature: 'Compra para consumo',
      paymentMethod: null,
      notes: 'Registro historico sem data de emissao.',
      total: 246.9,
      negotiatedSavings: 19.8,
      departments: ['Clinica'],
      itemCount: 1,
      source: 'GOOGLE_SHEETS',
      sourceReference: 'linha-1042',
      createdAt: '2026-07-15T12:00:00.000Z',
      updatedAt: '2026-07-16T12:00:00.000Z',
      items: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          description: 'Material clinico',
          quantity: 2,
          unit: 'CX',
          unitPrice: 123.45,
          negotiatedPrice: 113.55,
          total: 246.9,
          costCenterId: null,
          costCenterName: null,
          allocations: [
            {
              costCenterId: '40000000-0000-4000-8000-000000000001',
              costCenterName: 'Clinica',
              percentage: 100,
              amount: 246.9,
            },
          ],
        },
      ],
      installments: [
        {
          sequence: 1,
          dueDate: '2026-08-15',
          amount: 246.9,
          paidAt: null,
          paymentChannel: null,
          paymentReference: null,
          paymentNotes: null,
        },
      ],
      fiscalDocuments: [],
    };

    expect(purchaseDetailToEditor(detail)).toEqual({
      form: {
        category: 'Materiais',
        fiscalDocumentRequired: true,
        invoiceNumber: 'NF-7788',
        issuedAt: '',
        notes: 'Registro historico sem data de emissao.',
        number: 'PED-1042',
        operationNature: 'Compra para consumo',
        paymentMethod: '',
        supplierId: '20000000-0000-4000-8000-000000000001',
      },
      items: [
        {
          allocations: [
            {
              costCenterId: '40000000-0000-4000-8000-000000000001',
              id: '30000000-0000-4000-8000-000000000001-allocation-0',
              percentage: '100',
            },
          ],
          costCenterId: '',
          description: 'Material clinico',
          id: '30000000-0000-4000-8000-000000000001',
          negotiatedPrice: '113,55',
          quantity: '2',
          unit: 'CX',
          unitPrice: '123,45',
        },
      ],
      installments: [
        {
          amount: '246,9',
          dueDate: '2026-08-15',
          id: '10000000-0000-4000-8000-000000000001-installment-1',
          paidAt: null,
          paymentChannel: '',
          paymentReference: '',
          paymentNotes: '',
        },
      ],
    });
  });
});

describe('purchase card interaction', () => {
  it('opens from the card body but ignores double clicks on embedded controls', () => {
    expect(shouldOpenPurchaseOnDoubleClick(null)).toBe(true);
    expect(
      shouldOpenPurchaseOnDoubleClick({ closest: () => null } as unknown as EventTarget),
    ).toBe(true);
    expect(
      shouldOpenPurchaseOnDoubleClick({ closest: () => ({}) } as unknown as EventTarget),
    ).toBe(false);
  });

  it('derives the initial value and savings percentage from the negotiated total', () => {
    expect(purchaseNegotiationMetrics(800, 200)).toEqual({
      initialValue: 1_000,
      negotiatedValue: 800,
      savings: 200,
      savingsPercentage: 20,
    });
    expect(purchaseNegotiationMetrics(0, 0).savingsPercentage).toBe(0);
  });

  it('shows every confirmed approver in the card attribution', () => {
    expect(
      approvedByLabel([
        {
          userId: '10000000-0000-4000-8000-000000000001',
          name: 'Pedro Henrique',
          decidedAt: '2026-08-02T18:00:00.000Z',
        },
        {
          userId: '10000000-0000-4000-8000-000000000002',
          name: 'Mariana Silva',
          decidedAt: '2026-08-02T18:05:00.000Z',
        },
      ]),
    ).toBe('Pedro Henrique e Mariana Silva');
  });
});
