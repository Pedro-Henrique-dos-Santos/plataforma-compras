import { describe, expect, it } from 'vitest';
import type { InvoiceReviewInput } from '@compras/contracts';

import {
  DEMO_AUTH_USER_ID,
  DEMO_USER_ID,
  HUMAN_CLINIC_ID,
} from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { DemoProcurementRepository } from '../procurement/demo-procurement.repository.js';
import { DemoInvoiceDocumentsRepository } from './demo-invoice-documents.repository.js';
import { InvoiceDocumentStorage } from './invoice-document.storage.js';
import { InvoiceDocumentsService } from './invoice-documents.service.js';
import { InvoicePdfParser } from './invoice-pdf.parser.js';

const actor: AuthenticatedIdentity = {
  id: DEMO_USER_ID,
  authUserId: DEMO_AUTH_USER_ID,
  email: 'owner@example.com',
  name: 'Owner',
  platformRoles: ['PLATFORM_OWNER'],
};

describe('invoice document import reconciliation', () => {
  it('attaches the invoice to a matching purchase instead of duplicating it', async () => {
    const procurement = new DemoProcurementRepository();
    const documents = new DemoInvoiceDocumentsRepository();
    const supplier = await procurement.createSupplier(actor, HUMAN_CLINIC_ID, {
      legalName: 'Fornecedor Conciliado Ltda',
      tradeName: null,
      document: '11222333000181',
      category: 'Materiais',
      operationNature: null,
      paymentMethod: null,
      defaultCostCenterId: null,
      email: null,
      phone: null,
      notes: null,
    });
    await procurement.createPurchase(actor, HUMAN_CLINIC_ID, {
      number: 'PED-RECONCILIAR',
      invoiceNumber: null,
      supplierId: supplier.id,
      issuedAt: '2026-07-14',
      category: 'Materiais',
      operationNature: null,
      paymentMethod: null,
      notes: null,
      source: 'MANUAL',
      sourceReference: null,
      workflowStage: 'PURCHASE_ORDER',
      items: [
        {
          description: 'Material hospitalar',
          quantity: 1,
          unit: 'UN',
          unitPrice: 100,
          negotiatedPrice: null,
          costCenterId: null,
          allocations: [],
        },
      ],
      installments: [],
    });
    const review = invoiceReview({ supplierId: supplier.id });
    const documentId = await readyDocument(documents, review, 'hash-attach');
    const service = createService(documents, procurement);

    const result = await service.import(actor, HUMAN_CLINIC_ID, documentId);

    expect(result.action).toBe('ATTACHED_INVOICE');
    expect(result.purchase.number).toBe('PED-RECONCILIAR');
    expect(result.purchase.invoiceNumber).toBe('NF-900');
    expect(result.document.status).toBe('IMPORTED');
  });

  it('creates a supplier and purchase only after the reviewed document is confirmed', async () => {
    const procurement = new DemoProcurementRepository();
    const documents = new DemoInvoiceDocumentsRepository();
    const review = invoiceReview({
      supplierId: null,
      supplierName: 'Novo Fornecedor Fiscal Ltda',
      supplierDocument: '04252011000110',
      invoiceNumber: 'NF-901',
      total: 75,
      items: [
        {
          description: 'Servico de manutencao',
          quantity: 1,
          unit: 'SERVICO',
          unitPrice: 75,
          negotiatedPrice: null,
          costCenterId: null,
        },
      ],
    });
    const documentId = await readyDocument(documents, review, 'hash-create');
    const service = createService(documents, procurement);

    const result = await service.import(actor, HUMAN_CLINIC_ID, documentId);

    expect(result.action).toBe('CREATED');
    expect(result.supplierCreated).toBe(true);
    expect(result.purchase.source).toBe('INVOICE');
    expect(result.purchase.sourceReference).toBe(documentId);
    expect(result.document.review?.supplierId).toBe(result.purchase.supplierId);
    const purchaseCountAfterImport = (
      await procurement.listPurchases(HUMAN_CLINIC_ID)
    ).length;

    await expect(
      service.import(actor, HUMAN_CLINIC_ID, documentId),
    ).rejects.toThrow('ja foi importada');
    expect(await procurement.listPurchases(HUMAN_CLINIC_ID)).toHaveLength(
      purchaseCountAfterImport,
    );
  });
});

function createService(
  documents: DemoInvoiceDocumentsRepository,
  procurement: DemoProcurementRepository,
) {
  return new InvoiceDocumentsService(
    documents,
    procurement,
    {} as unknown as InvoiceDocumentStorage,
    {} as unknown as InvoicePdfParser,
  );
}

async function readyDocument(
  documents: DemoInvoiceDocumentsRepository,
  review: InvoiceReviewInput,
  hash: string,
): Promise<string> {
  const document = await documents.create(actor, HUMAN_CLINIC_ID, {
    fileName: 'nota.xml',
    kind: 'XML',
    mimeType: 'application/xml',
    sha256: hash,
    size: 100,
    storagePath: `demo/${hash}.xml`,
  });
  await documents.completeExtraction(HUMAN_CLINIC_ID, document.id, {
    parser: 'NFE_XML',
    warnings: [],
    extraction: {
      invoiceNumber: review.invoiceNumber,
      accessKey: review.accessKey,
      issuedAt: review.issuedAt,
      supplierName: review.supplierName,
      supplierDocument: review.supplierDocument,
      total: review.total,
      category: review.category,
      operationNature: review.operationNature,
      paymentMethod: review.paymentMethod,
      items: review.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: item.quantity * (item.negotiatedPrice ?? item.unitPrice),
      })),
      installments: review.installments,
      triageStatus: 'IN_SCOPE',
      triageReason: null,
      confidence: 1,
    },
  });
  await documents.saveReview(actor, HUMAN_CLINIC_ID, document.id, review);
  return document.id;
}

function invoiceReview(
  overrides: Partial<InvoiceReviewInput> = {},
): InvoiceReviewInput {
  return {
    supplierId: null,
    supplierName: 'Fornecedor Conciliado Ltda',
    supplierDocument: '11222333000181',
    invoiceNumber: 'NF-900',
    accessKey: null,
    issuedAt: '2026-07-14',
    total: 100,
    category: 'Materiais',
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
    ...overrides,
  };
}
