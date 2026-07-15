import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  InvoiceDocumentSummary,
  InvoiceReviewInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import {
  type CompleteInvoiceExtraction,
  type CreateInvoiceDocumentRecord,
  type InvoiceDocumentFilters,
  type InvoiceDocumentRecord,
  invoiceImportConflictMessage,
  InvoiceDocumentsRepository,
  toInvoiceDocumentSummary,
} from './invoice-documents.repository.js';

export class DemoInvoiceDocumentsRepository extends InvoiceDocumentsRepository {
  private readonly documents: InvoiceDocumentRecord[] = [];

  async list(
    organizationId: string,
    filters: InvoiceDocumentFilters = {},
  ): Promise<InvoiceDocumentSummary[]> {
    const search = normalize(filters.search ?? '');
    return this.documents
      .filter((document) => document.organizationId === organizationId)
      .filter((document) => !filters.status || document.status === filters.status)
      .filter((document) => {
        const searchable = `${document.fileName} ${document.invoiceNumber ?? ''} ${document.supplierName ?? ''} ${document.supplierDocument ?? ''}`;
        return !search || normalize(searchable).includes(search);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toInvoiceDocumentSummary);
  }

  async find(organizationId: string, id: string): Promise<InvoiceDocumentRecord | null> {
    const document = this.documents.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    return document ? structuredClone(document) : null;
  }

  async findByHash(
    organizationId: string,
    sha256: string,
  ): Promise<InvoiceDocumentRecord | null> {
    const document = this.documents.find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.sha256 === sha256,
    );
    return document ? structuredClone(document) : null;
  }

  async create(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateInvoiceDocumentRecord,
  ): Promise<InvoiceDocumentRecord> {
    if (await this.findByHash(organizationId, input.sha256)) {
      throw new ConflictException('Este arquivo ja foi enviado para a empresa ativa.');
    }
    const now = new Date().toISOString();
    const document: InvoiceDocumentRecord = {
      id: randomUUID(),
      organizationId,
      purchaseId: null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      kind: input.kind,
      size: input.size,
      sha256: input.sha256,
      storagePath: input.storagePath,
      status: 'PROCESSING',
      parser: null,
      confidence: null,
      invoiceNumber: null,
      supplierName: null,
      supplierDocument: null,
      issuedAt: null,
      total: null,
      triageStatus: null,
      warnings: [],
      errors: [],
      extraction: null,
      review: null,
      createdAt: now,
      processedAt: null,
      reviewedAt: null,
      importedAt: null,
    };
    this.documents.push(document);
    return structuredClone(document);
  }

  async completeExtraction(
    organizationId: string,
    id: string,
    input: CompleteInvoiceExtraction,
  ): Promise<InvoiceDocumentRecord> {
    const document = this.require(organizationId, id);
    const now = new Date().toISOString();
    Object.assign(document, {
      status:
        input.extraction.triageStatus === 'OUT_OF_SCOPE'
          ? ('OUT_OF_SCOPE' as const)
          : ('REVIEW_REQUIRED' as const),
      parser: input.parser,
      confidence: input.extraction.confidence,
      invoiceNumber: input.extraction.invoiceNumber,
      supplierName: input.extraction.supplierName,
      supplierDocument: input.extraction.supplierDocument,
      issuedAt: input.extraction.issuedAt,
      total: input.extraction.total,
      triageStatus: input.extraction.triageStatus,
      warnings: [...input.warnings],
      errors: [],
      extraction: structuredClone(input.extraction),
      review: null,
      processedAt: now,
      reviewedAt: null,
    });
    return structuredClone(document);
  }

  async failExtraction(
    organizationId: string,
    id: string,
    errors: string[],
  ): Promise<InvoiceDocumentRecord> {
    const document = this.require(organizationId, id);
    document.status = 'FAILED';
    document.errors = [...errors];
    document.processedAt = new Date().toISOString();
    return structuredClone(document);
  }

  async resetForProcessing(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord> {
    const document = this.requireMutable(organizationId, id);
    Object.assign(document, {
      status: 'PROCESSING' as const,
      parser: null,
      confidence: null,
      errors: [],
      warnings: [],
      processedAt: null,
      review: null,
      reviewedAt: null,
    });
    return structuredClone(document);
  }

  async saveReview(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    review: InvoiceReviewInput,
  ): Promise<InvoiceDocumentRecord> {
    const document = this.requireMutable(organizationId, id);
    const now = new Date().toISOString();
    Object.assign(document, {
      status: 'READY' as const,
      invoiceNumber: review.invoiceNumber,
      supplierName: review.supplierName,
      supplierDocument: review.supplierDocument,
      issuedAt: review.issuedAt,
      total: review.total,
      triageStatus: 'IN_SCOPE' as const,
      review: structuredClone(review),
      reviewedAt: now,
      errors: [],
    });
    return structuredClone(document);
  }

  async reject(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    reason: string,
  ): Promise<InvoiceDocumentRecord> {
    const document = this.requireMutable(organizationId, id);
    document.status = 'OUT_OF_SCOPE';
    document.triageStatus = 'OUT_OF_SCOPE';
    document.warnings = [...document.warnings, reason];
    document.reviewedAt = new Date().toISOString();
    return structuredClone(document);
  }

  async claimForImport(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord> {
    const document = this.require(organizationId, id);
    if (document.status !== 'READY' || !document.review) {
      throw new ConflictException(invoiceImportConflictMessage(document.status));
    }
    document.status = 'IMPORTING';
    return structuredClone(document);
  }

  async releaseImport(
    organizationId: string,
    id: string,
    error: string,
  ): Promise<void> {
    const document = this.require(organizationId, id);
    if (document.status === 'IMPORTING') {
      document.status = 'READY';
      document.errors = [error];
    }
  }

  async markImported(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    purchaseId: string,
    supplierId: string,
  ): Promise<InvoiceDocumentRecord> {
    const document = this.require(organizationId, id);
    if (document.status !== 'IMPORTING') {
      throw new ConflictException('A nota nao esta reservada para importacao.');
    }
    document.status = 'IMPORTED';
    document.purchaseId = purchaseId;
    if (document.review) document.review.supplierId = supplierId;
    document.importedAt = new Date().toISOString();
    document.errors = [];
    return structuredClone(document);
  }

  private require(organizationId: string, id: string): InvoiceDocumentRecord {
    const document = this.documents.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!document) {
      throw new NotFoundException('Documento fiscal nao encontrado.');
    }
    return document;
  }

  private requireMutable(organizationId: string, id: string): InvoiceDocumentRecord {
    const document = this.require(organizationId, id);
    if (['IMPORTED', 'IMPORTING'].includes(document.status)) {
      throw new ConflictException('O documento nao pode ser alterado neste estado.');
    }
    return document;
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
