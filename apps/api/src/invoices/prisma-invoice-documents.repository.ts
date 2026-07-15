import { ConflictException, NotFoundException } from '@nestjs/common';
import type {
  InvoiceDocumentSummary,
  InvoiceReviewInput,
} from '@compras/contracts';
import {
  invoiceExtractionSchema,
  invoiceReviewInputSchema,
} from '@compras/contracts';
import {
  Prisma,
  type PrismaClient,
  type PrismaInvoiceDocument,
} from '@compras/database';

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

export class PrismaInvoiceDocumentsRepository extends InvoiceDocumentsRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async list(
    organizationId: string,
    filters: InvoiceDocumentFilters = {},
  ): Promise<InvoiceDocumentSummary[]> {
    const rows = await this.prisma.invoiceDocument.findMany({
      where: {
        organizationId,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            { fileName: { contains: filters.search, mode: 'insensitive' } },
            { invoiceNumber: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toRecord).map(toInvoiceDocumentSummary);
  }

  async find(organizationId: string, id: string): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prisma.invoiceDocument.findFirst({
      where: { id, organizationId },
    });
    return row ? toRecord(row) : null;
  }

  async findByHash(
    organizationId: string,
    sha256: string,
  ): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prisma.invoiceDocument.findFirst({
      where: { organizationId, sha256 },
    });
    return row ? toRecord(row) : null;
  }

  async create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateInvoiceDocumentRecord,
  ): Promise<InvoiceDocumentRecord> {
    try {
      const id = await this.prisma.$transaction(async (transaction) => {
        const document = await transaction.invoiceDocument.create({
          data: {
            organizationId,
            createdById: actor.id,
            fileName: input.fileName,
            mimeType: input.mimeType,
            kind: input.kind,
            size: input.size,
            sha256: input.sha256,
            storagePath: input.storagePath,
            status: 'PROCESSING',
            warnings: [],
            errors: [],
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'invoice_document',
            resourceId: document.id,
            metadata: {
              fileName: input.fileName,
              kind: input.kind,
              size: input.size,
            },
          },
        });
        return document.id;
      });
      return await this.require(organizationId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Este arquivo ja foi enviado para a empresa ativa.');
      }
      throw error;
    }
  }

  async completeExtraction(
    organizationId: string,
    id: string,
    input: CompleteInvoiceExtraction,
  ): Promise<InvoiceDocumentRecord> {
    const status =
      input.extraction.triageStatus === 'OUT_OF_SCOPE'
        ? ('OUT_OF_SCOPE' as const)
        : ('REVIEW_REQUIRED' as const);
    await this.updateExisting(organizationId, id, {
      status,
      parser: input.parser,
      confidence: input.extraction.confidence,
      invoiceNumber: input.extraction.invoiceNumber,
      accessKey: input.extraction.accessKey,
      parsedData: jsonValue(input.extraction),
      reviewData: Prisma.DbNull,
      warnings: input.warnings,
      errors: [],
      processedAt: new Date(),
      reviewedAt: null,
    });
    return this.require(organizationId, id);
  }

  async failExtraction(
    organizationId: string,
    id: string,
    errors: string[],
  ): Promise<InvoiceDocumentRecord> {
    await this.updateExisting(organizationId, id, {
      status: 'FAILED',
      errors,
      processedAt: new Date(),
    });
    return this.require(organizationId, id);
  }

  async resetForProcessing(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord> {
    const updated = await this.prisma.invoiceDocument.updateMany({
      where: {
        id,
        organizationId,
        status: { notIn: ['IMPORTED', 'IMPORTING'] },
      },
      data: {
        status: 'PROCESSING',
        parser: null,
        confidence: null,
        parsedData: Prisma.DbNull,
        reviewData: Prisma.DbNull,
        warnings: [],
        errors: [],
        processedAt: null,
        reviewedAt: null,
      },
    });
    if (!updated.count) {
      await this.throwMissingOrImmutable(organizationId, id);
    }
    await this.writeAudit(actor, organizationId, 'UPDATE', id, {
      operation: 'reprocess',
    });
    return this.require(organizationId, id);
  }

  async saveReview(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    review: InvoiceReviewInput,
  ): Promise<InvoiceDocumentRecord> {
    const updated = await this.prisma.invoiceDocument.updateMany({
      where: {
        id,
        organizationId,
        status: { notIn: ['IMPORTED', 'IMPORTING'] },
      },
      data: {
        status: 'READY',
        invoiceNumber: review.invoiceNumber,
        accessKey: review.accessKey,
        reviewData: jsonValue(review),
        reviewedById: actor.id,
        reviewedAt: new Date(),
        errors: [],
      },
    });
    if (!updated.count) {
      await this.throwMissingOrImmutable(organizationId, id);
    }
    await this.writeAudit(actor, organizationId, 'UPDATE', id, {
      operation: 'review',
      invoiceNumber: review.invoiceNumber,
    });
    return this.require(organizationId, id);
  }

  async reject(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    reason: string,
  ): Promise<InvoiceDocumentRecord> {
    const current = await this.require(organizationId, id);
    if (['IMPORTED', 'IMPORTING'].includes(current.status)) {
      throw new ConflictException('O documento nao pode ser alterado neste estado.');
    }
    await this.updateExisting(organizationId, id, {
      status: 'OUT_OF_SCOPE',
      reviewedById: actor.id,
      reviewedAt: new Date(),
      warnings: [...current.warnings, reason],
    });
    await this.writeAudit(actor, organizationId, 'UPDATE', id, {
      operation: 'reject',
      reason,
    });
    return this.require(organizationId, id);
  }

  async claimForImport(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord> {
    const updated = await this.prisma.invoiceDocument.updateMany({
      where: { id, organizationId, status: 'READY' },
      data: { status: 'IMPORTING', errors: [] },
    });
    if (!updated.count) {
      const document = await this.find(organizationId, id);
      if (!document) throw new NotFoundException('Documento fiscal nao encontrado.');
      throw new ConflictException(invoiceImportConflictMessage(document.status));
    }
    return this.require(organizationId, id);
  }

  async releaseImport(
    organizationId: string,
    id: string,
    error: string,
  ): Promise<void> {
    await this.prisma.invoiceDocument.updateMany({
      where: { id, organizationId, status: 'IMPORTING' },
      data: { status: 'READY', errors: [error] },
    });
  }

  async markImported(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    purchaseId: string,
    supplierId: string,
  ): Promise<InvoiceDocumentRecord> {
    const current = await this.require(organizationId, id);
    if (!current.review) {
      throw new ConflictException('A nota precisa estar revisada antes da importacao.');
    }
    const finalReview = { ...current.review, supplierId };
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.invoiceDocument.updateMany({
        where: { id, organizationId, status: 'IMPORTING' },
        data: {
          status: 'IMPORTED',
          purchaseId,
          reviewData: jsonValue(finalReview),
          importedById: actor.id,
          importedAt: new Date(),
          errors: [],
        },
      });
      if (!result.count) return false;
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'IMPORT',
          resource: 'invoice_document',
          resourceId: id,
          metadata: { purchaseId, supplierId },
        },
      });
      return true;
    });
    if (!updated) {
      throw new ConflictException('A nota nao esta reservada para importacao.');
    }
    return this.require(organizationId, id);
  }

  private async require(
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord> {
    const row = await this.prisma.invoiceDocument.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Documento fiscal nao encontrado.');
    return toRecord(row);
  }

  private async updateExisting(
    organizationId: string,
    id: string,
    data: Prisma.InvoiceDocumentUncheckedUpdateManyInput,
  ): Promise<void> {
    const updated = await this.prisma.invoiceDocument.updateMany({
      where: { id, organizationId },
      data,
    });
    if (!updated.count) throw new NotFoundException('Documento fiscal nao encontrado.');
  }

  private async throwMissingOrImmutable(
    organizationId: string,
    id: string,
  ): Promise<never> {
    const document = await this.find(organizationId, id);
    if (!document) throw new NotFoundException('Documento fiscal nao encontrado.');
    throw new ConflictException('O documento nao pode ser alterado neste estado.');
  }

  private async writeAudit(
    actor: AuthenticatedIdentity,
    organizationId: string,
    action: 'UPDATE',
    resourceId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        organizationId,
        action,
        resource: 'invoice_document',
        resourceId,
        metadata,
      },
    });
  }
}

function toRecord(row: PrismaInvoiceDocument): InvoiceDocumentRecord {
  const extractionResult = invoiceExtractionSchema.safeParse(row.parsedData);
  const reviewResult = invoiceReviewInputSchema.safeParse(row.reviewData);
  const extraction = extractionResult.success ? extractionResult.data : null;
  const review = reviewResult.success ? reviewResult.data : null;
  const current = review ?? extraction;
  return {
    id: row.id,
    organizationId: row.organizationId,
    purchaseId: row.purchaseId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    kind: row.kind,
    size: row.size,
    sha256: row.sha256 ?? '',
    storagePath: row.storagePath,
    status: row.status,
    parser: row.parser,
    confidence: row.confidence?.toNumber() ?? null,
    invoiceNumber: row.invoiceNumber,
    supplierName: current?.supplierName ?? null,
    supplierDocument: current?.supplierDocument ?? null,
    issuedAt: current?.issuedAt ?? null,
    total: current?.total ?? null,
    triageStatus:
      row.status === 'OUT_OF_SCOPE'
        ? 'OUT_OF_SCOPE'
        : review
          ? 'IN_SCOPE'
          : extraction?.triageStatus ?? null,
    warnings: stringArray(row.warnings),
    errors: stringArray(row.errors),
    extraction,
    review,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    importedAt: row.importedAt?.toISOString() ?? null,
  };
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
