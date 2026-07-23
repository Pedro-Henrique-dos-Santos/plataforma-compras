import { describe, expect, it } from 'vitest';
import type { InvoiceReviewInput } from '@compras/contracts';

import { DEMO_AUTH_USER_ID, DEMO_USER_ID, HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { DemoInvoiceDocumentsRepository } from './demo-invoice-documents.repository.js';
import { toInvoiceDocumentDetail } from './invoice-documents.repository.js';

const actor: AuthenticatedIdentity = {
  id: DEMO_USER_ID,
  authUserId: DEMO_AUTH_USER_ID,
  email: 'owner@example.com',
  name: 'Owner',
  platformRoles: ['PLATFORM_OWNER'],
};

const review: InvoiceReviewInput = {
  supplierId: null,
  supplierName: 'Fornecedor Exemplo Ltda',
  supplierDocument: '11222333000181',
  invoiceNumber: '1234',
  accessKey: null,
  issuedAt: '2026-07-14',
  total: 100,
  category: null,
  operationNature: null,
  paymentMethod: null,
  defaultCostCenterId: null,
  items: [
    {
      description: 'Material hospitalar',
      quantity: 1,
      unit: 'UN',
      unitPrice: 100,
      negotiatedPrice: null,
      costCenterId: null,
    },
  ],
  installments: [],
  notes: null,
};

describe('demo invoice document repository', () => {
  it('isolates duplicate hashes by organization', async () => {
    const repository = new DemoInvoiceDocumentsRepository();
    await repository.create(actor, HUMAN_CLINIC_ID, documentInput('same-hash'));
    await expect(
      repository.create(actor, HUMAN_CLINIC_ID, documentInput('same-hash')),
    ).rejects.toThrow('ja foi enviado');
    await expect(
      repository.create(
        actor,
        '22222222-2222-4222-8222-222222222222',
        documentInput('same-hash'),
      ),
    ).resolves.toBeDefined();
  });

  it('enforces review and import state transitions', async () => {
    const repository = new DemoInvoiceDocumentsRepository();
    const document = await repository.create(
      actor,
      HUMAN_CLINIC_ID,
      documentInput('transition-hash'),
    );
    await repository.completeExtraction(HUMAN_CLINIC_ID, document.id, {
      parser: 'NFE_XML',
      warnings: [],
      extraction: {
        invoiceNumber: '1234',
        accessKey: null,
        issuedAt: '2026-07-14',
        supplierName: 'Fornecedor Exemplo Ltda',
        supplierDocument: '11222333000181',
        total: 100,
        category: null,
        operationNature: null,
        paymentMethod: null,
        items: [
          {
            description: 'Material hospitalar',
            quantity: 1,
            unit: 'UN',
            unitPrice: 100,
            total: 100,
          },
        ],
        installments: [],
        triageStatus: 'IN_SCOPE',
        triageReason: null,
        confidence: 1,
      },
    });
    await expect(
      repository.claimForImport(actor, HUMAN_CLINIC_ID, document.id),
    ).rejects.toThrow('precisa estar revisada');
    const ready = await repository.saveReview(
      actor,
      HUMAN_CLINIC_ID,
      document.id,
      review,
    );
    expect(ready.status).toBe('READY');
    const claimed = await repository.claimForImport(
      actor,
      HUMAN_CLINIC_ID,
      document.id,
    );
    expect(claimed.status).toBe('IMPORTING');
    await expect(
      repository.claimForImport(actor, HUMAN_CLINIC_ID, document.id),
    ).rejects.toThrow('ja esta em andamento');
    const imported = await repository.markImported(
      actor,
      HUMAN_CLINIC_ID,
      document.id,
      '99999999-9999-4999-8999-999999999999',
      '88888888-8888-4888-8888-888888888888',
    );
    expect(imported.status).toBe('IMPORTED');
    expect(imported.review?.supplierId).toBe(
      '88888888-8888-4888-8888-888888888888',
    );
    await expect(
      repository.claimForImport(actor, HUMAN_CLINIC_ID, document.id),
    ).rejects.toThrow('ja foi importada');
  });

  it('never exposes tenant, hash or storage path in the public detail', async () => {
    const repository = new DemoInvoiceDocumentsRepository();
    const document = await repository.create(
      actor,
      HUMAN_CLINIC_ID,
      documentInput('private-hash'),
    );

    expect(toInvoiceDocumentDetail(document)).not.toHaveProperty('organizationId');
    expect(toInvoiceDocumentDetail(document)).not.toHaveProperty('sha256');
    expect(toInvoiceDocumentDetail(document)).not.toHaveProperty('storagePath');
  });
});

function documentInput(sha256: string) {
  return {
    fileName: 'nota.xml',
    kind: 'XML' as const,
    mimeType: 'application/xml',
    sha256,
    size: 100,
    storagePath: `demo/${sha256}.xml`,
  };
}
