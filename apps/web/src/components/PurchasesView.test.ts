import type { PurchaseDetail } from '@compras/contracts';
import { describe, expect, it } from 'vitest';

import { purchaseDetailToEditor } from './PurchasesView';

describe('purchase detail editor', () => {
  it('preserves historical nullable fields, allocations and installments', () => {
    const detail: PurchaseDetail = {
      id: '10000000-0000-4000-8000-000000000001',
      number: 'PED-1042',
      invoiceNumber: 'NF-7788',
      supplierId: '20000000-0000-4000-8000-000000000001',
      supplierName: 'Fornecedor de teste',
      issuedAt: null,
      status: 'REGISTERED',
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
        },
      ],
    };

    expect(purchaseDetailToEditor(detail)).toEqual({
      form: {
        category: 'Materiais',
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
        },
      ],
    });
  });
});
