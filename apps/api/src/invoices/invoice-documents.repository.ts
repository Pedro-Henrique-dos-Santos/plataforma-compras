import type {
  InvoiceDocumentDetail,
  InvoiceDocumentKind,
  InvoiceDocumentStatus,
  InvoiceDocumentSummary,
  InvoiceExtraction,
  InvoiceReviewInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';

export type InvoiceDocumentFilters = {
  search?: string;
  status?: InvoiceDocumentStatus;
};

export type InvoiceDocumentRecord = InvoiceDocumentDetail & {
  organizationId: string;
  sha256: string;
  storagePath: string;
};

export type CreateInvoiceDocumentRecord = {
  fileName: string;
  kind: InvoiceDocumentKind;
  mimeType: string;
  sha256: string;
  size: number;
  storagePath: string;
};

export type CompleteInvoiceExtraction = {
  extraction: InvoiceExtraction;
  parser: string;
  warnings: string[];
};

export abstract class InvoiceDocumentsRepository {
  abstract list(
    organizationId: string,
    filters?: InvoiceDocumentFilters,
  ): Promise<InvoiceDocumentSummary[]>;

  abstract find(
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord | null>;

  abstract findByHash(
    organizationId: string,
    sha256: string,
  ): Promise<InvoiceDocumentRecord | null>;

  abstract create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateInvoiceDocumentRecord,
  ): Promise<InvoiceDocumentRecord>;

  abstract completeExtraction(
    organizationId: string,
    id: string,
    input: CompleteInvoiceExtraction,
  ): Promise<InvoiceDocumentRecord>;

  abstract failExtraction(
    organizationId: string,
    id: string,
    errors: string[],
  ): Promise<InvoiceDocumentRecord>;

  abstract resetForProcessing(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord>;

  abstract saveReview(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    review: InvoiceReviewInput,
  ): Promise<InvoiceDocumentRecord>;

  abstract reject(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    reason: string,
  ): Promise<InvoiceDocumentRecord>;

  abstract claimForImport(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord>;

  abstract releaseImport(
    organizationId: string,
    id: string,
    error: string,
  ): Promise<void>;

  abstract markImported(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    purchaseId: string,
    supplierId: string,
  ): Promise<InvoiceDocumentRecord>;
}

export function toInvoiceDocumentSummary(
  document: InvoiceDocumentRecord,
): InvoiceDocumentSummary {
  const {
    organizationId: _organizationId,
    sha256: _sha256,
    storagePath: _storagePath,
    extraction: _extraction,
    review: _review,
    ...summary
  } = document;
  return summary;
}

export function toInvoiceDocumentDetail(
  document: InvoiceDocumentRecord,
): InvoiceDocumentDetail {
  const {
    organizationId: _organizationId,
    sha256: _sha256,
    storagePath: _storagePath,
    ...detail
  } = document;
  return detail;
}
