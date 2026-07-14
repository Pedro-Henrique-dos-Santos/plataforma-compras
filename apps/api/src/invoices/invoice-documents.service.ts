import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  InvoiceDocumentDetail,
  InvoiceDocumentSummary,
  InvoiceImportAction,
  InvoiceImportResult,
  InvoiceReviewInput,
  PurchaseSummary,
  Supplier,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import {
  ProcurementRepository,
  type PurchaseFilters,
} from '../procurement/procurement.repository.js';
import { InvoiceDocumentStorage } from './invoice-document.storage.js';
import {
  type InvoiceDocumentFilters,
  type InvoiceDocumentRecord,
  InvoiceDocumentsRepository,
  toInvoiceDocumentDetail,
} from './invoice-documents.repository.js';
import {
  type UploadedInvoiceFile,
  validateInvoiceFile,
} from './invoice-file.validator.js';
import { InvoicePdfParser } from './invoice-pdf.parser.js';
import { parseInvoiceXml } from './invoice-xml.parser.js';

@Injectable()
export class InvoiceDocumentsService {
  constructor(
    @Inject(InvoiceDocumentsRepository)
    private readonly documents: InvoiceDocumentsRepository,
    @Inject(ProcurementRepository)
    private readonly procurement: ProcurementRepository,
    @Inject(InvoiceDocumentStorage)
    private readonly storage: InvoiceDocumentStorage,
    @Inject(InvoicePdfParser)
    private readonly pdfParser: InvoicePdfParser,
  ) {}

  list(
    organizationId: string,
    filters: InvoiceDocumentFilters,
  ): Promise<InvoiceDocumentSummary[]> {
    return this.documents.list(organizationId, filters);
  }

  async find(organizationId: string, id: string): Promise<InvoiceDocumentDetail> {
    return toInvoiceDocumentDetail(await this.require(organizationId, id));
  }

  async upload(
    actor: AuthenticatedIdentity,
    organizationId: string,
    uploadedFile: UploadedInvoiceFile | undefined,
  ): Promise<InvoiceDocumentDetail> {
    const file = await validateInvoiceFile(uploadedFile);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.documents.findByHash(organizationId, sha256);
    if (existing) {
      throw new ConflictException(
        `Este arquivo ja foi enviado como ${existing.fileName}.`,
      );
    }
    const storagePath = await this.storage.save(
      organizationId,
      file.fileName,
      file.mimeType,
      file.buffer,
    );
    let document: InvoiceDocumentRecord;
    try {
      document = await this.documents.create(actor, organizationId, {
        fileName: file.fileName,
        kind: file.kind,
        mimeType: file.mimeType,
        sha256,
        size: file.size,
        storagePath,
      });
    } catch (error) {
      await this.storage.remove(storagePath);
      throw error;
    }
    return this.process(organizationId, document, file.buffer);
  }

  async reprocess(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentDetail> {
    const document = await this.require(organizationId, id);
    const processing = await this.documents.resetForProcessing(
      actor,
      organizationId,
      id,
    );
    try {
      const buffer = await this.storage.read(document.storagePath);
      return await this.process(organizationId, processing, buffer);
    } catch (error) {
      return toInvoiceDocumentDetail(
        await this.documents.failExtraction(organizationId, id, [errorMessage(error)]),
      );
    }
  }

  async review(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    review: InvoiceReviewInput,
  ): Promise<InvoiceDocumentDetail> {
    await this.validateCostCenters(organizationId, review);
    return toInvoiceDocumentDetail(
      await this.documents.saveReview(actor, organizationId, id, review),
    );
  }

  async reject(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    reason: string,
  ): Promise<InvoiceDocumentDetail> {
    return toInvoiceDocumentDetail(
      await this.documents.reject(actor, organizationId, id, reason),
    );
  }

  async import(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
  ): Promise<InvoiceImportResult> {
    const document = await this.documents.claimForImport(actor, organizationId, id);
    try {
      if (!document.review) {
        throw new ConflictException('A nota precisa estar revisada antes da importacao.');
      }
      const supplierResolution = await this.resolveSupplier(
        actor,
        organizationId,
        document.review,
      );
      const reconciliation = await this.reconcilePurchase(
        actor,
        organizationId,
        document,
        supplierResolution.supplier,
      );
      const imported = await this.documents.markImported(
        actor,
        organizationId,
        id,
        reconciliation.purchase.id,
        supplierResolution.supplier.id,
      );
      return {
        action: reconciliation.action,
        document: toInvoiceDocumentDetail(imported),
        purchase: reconciliation.purchase,
        supplierCreated: supplierResolution.created,
      };
    } catch (error) {
      await this.documents.releaseImport(organizationId, id, errorMessage(error));
      throw error;
    }
  }

  private async process(
    organizationId: string,
    document: InvoiceDocumentRecord,
    buffer: Buffer,
  ): Promise<InvoiceDocumentDetail> {
    try {
      const result =
        document.kind === 'XML'
          ? parseInvoiceXml(buffer)
          : await this.pdfParser.parse(buffer);
      return toInvoiceDocumentDetail(
        await this.documents.completeExtraction(organizationId, document.id, result),
      );
    } catch (error) {
      return toInvoiceDocumentDetail(
        await this.documents.failExtraction(organizationId, document.id, [
          errorMessage(error),
        ]),
      );
    }
  }

  private async resolveSupplier(
    actor: AuthenticatedIdentity,
    organizationId: string,
    review: InvoiceReviewInput,
  ): Promise<{ created: boolean; supplier: Supplier }> {
    if (review.supplierId) {
      const supplier = await this.procurement.findSupplier(
        organizationId,
        review.supplierId,
      );
      if (!supplier || supplier.status !== 'ACTIVE') {
        throw new BadRequestException('Fornecedor selecionado nao existe ou esta inativo.');
      }
      return {
        created: false,
        supplier: await this.completeSupplierDefaults(
          actor,
          organizationId,
          supplier,
          review,
        ),
      };
    }

    const candidates = await this.procurement.listSuppliers(organizationId, {
      search: review.supplierDocument ?? review.supplierName,
      status: 'ACTIVE',
    });
    const exact = review.supplierDocument
      ? candidates.filter(
          (supplier) => digitsOnly(supplier.document) === review.supplierDocument,
        )
      : candidates.filter(
          (supplier) =>
            normalize(supplier.legalName) === normalize(review.supplierName) ||
            normalize(supplier.tradeName ?? '') === normalize(review.supplierName),
        );
    if (exact.length > 1) {
      throw new ConflictException(
        'Mais de um fornecedor corresponde a nota; selecione o cadastro correto.',
      );
    }
    if (exact[0]) {
      return {
        created: false,
        supplier: await this.completeSupplierDefaults(
          actor,
          organizationId,
          exact[0],
          review,
        ),
      };
    }

    const supplier = await this.procurement.createSupplier(actor, organizationId, {
      legalName: review.supplierName,
      tradeName: null,
      document: review.supplierDocument,
      category: review.category,
      operationNature: review.operationNature,
      paymentMethod: review.paymentMethod,
      defaultCostCenterId: review.defaultCostCenterId,
      email: null,
      phone: null,
      notes: 'Fornecedor criado a partir da conferencia de documento fiscal.',
    });
    return { created: true, supplier };
  }

  private async completeSupplierDefaults(
    actor: AuthenticatedIdentity,
    organizationId: string,
    supplier: Supplier,
    review: InvoiceReviewInput,
  ): Promise<Supplier> {
    const update = {
      ...(!supplier.defaultCostCenterId &&
        review.defaultCostCenterId && {
          defaultCostCenterId: review.defaultCostCenterId,
        }),
      ...(!supplier.category && review.category && { category: review.category }),
      ...(!supplier.operationNature &&
        review.operationNature && { operationNature: review.operationNature }),
      ...(!supplier.paymentMethod &&
        review.paymentMethod && { paymentMethod: review.paymentMethod }),
    };
    return Object.keys(update).length
      ? this.procurement.updateSupplier(
          actor,
          organizationId,
          supplier.id,
          update,
        )
      : supplier;
  }

  private async reconcilePurchase(
    actor: AuthenticatedIdentity,
    organizationId: string,
    document: InvoiceDocumentRecord,
    supplier: Supplier,
  ): Promise<{ action: InvoiceImportAction; purchase: PurchaseSummary }> {
    const review = document.review;
    if (!review) throw new ConflictException('A nota precisa estar revisada.');
    const candidates = await this.findPurchaseCandidates(organizationId, [
      document.id,
      review.invoiceNumber,
      supplier.legalName,
    ]);
    const supplierCandidates = candidates.filter(
      (purchase) => purchase.supplierId === supplier.id && purchase.status === 'REGISTERED',
    );
    const sourceMatch = supplierCandidates.find(
      (purchase) =>
        purchase.source === 'INVOICE' && purchase.sourceReference === document.id,
    );
    if (sourceMatch) return { action: 'LINKED_EXISTING', purchase: sourceMatch };

    const invoiceMatch = supplierCandidates.find(
      (purchase) => purchase.invoiceNumber === review.invoiceNumber,
    );
    if (invoiceMatch) return { action: 'LINKED_EXISTING', purchase: invoiceMatch };

    const sameValueWithoutInvoice = supplierCandidates.filter(
      (purchase) =>
        purchase.invoiceNumber === null && Math.abs(purchase.total - review.total) <= 0.01,
    );
    if (sameValueWithoutInvoice.length > 1) {
      throw new ConflictException(
        'Ha mais de uma compra com o mesmo fornecedor e valor; vincule a nota manualmente.',
      );
    }
    if (sameValueWithoutInvoice[0]) {
      const purchase = await this.procurement.attachPurchaseInvoice(
        actor,
        organizationId,
        sameValueWithoutInvoice[0].id,
        { invoiceNumber: review.invoiceNumber },
      );
      return { action: 'ATTACHED_INVOICE', purchase };
    }

    const purchase = await this.procurement.createPurchase(actor, organizationId, {
      number: `DOC-${review.issuedAt.replace(/-/g, '')}-${document.id.slice(0, 8)}`,
      invoiceNumber: review.invoiceNumber,
      supplierId: supplier.id,
      issuedAt: review.issuedAt,
      category: review.category,
      operationNature: review.operationNature,
      paymentMethod: review.paymentMethod,
      notes: review.notes,
      source: 'INVOICE',
      sourceReference: document.id,
      items: review.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        negotiatedPrice: item.negotiatedPrice,
        costCenterId: item.costCenterId ?? review.defaultCostCenterId,
        allocations: [],
      })),
      installments: review.installments,
    });
    return { action: 'CREATED', purchase };
  }

  private async findPurchaseCandidates(
    organizationId: string,
    searches: string[],
  ): Promise<PurchaseSummary[]> {
    const candidates = new Map<string, PurchaseSummary>();
    for (const search of searches) {
      const filters: PurchaseFilters = { search };
      for (const purchase of await this.procurement.listPurchases(
        organizationId,
        filters,
      )) {
        candidates.set(purchase.id, purchase);
      }
    }
    return [...candidates.values()];
  }

  private async validateCostCenters(
    organizationId: string,
    review: InvoiceReviewInput,
  ): Promise<void> {
    const ids = new Set(
      [
        review.defaultCostCenterId,
        ...review.items.map((item) => item.costCenterId),
      ].filter((id): id is string => Boolean(id)),
    );
    if (!ids.size) return;
    const activeCenters = await this.procurement.listCostCenters(organizationId);
    const activeIds = new Set(activeCenters.map((center) => center.id));
    if ([...ids].some((id) => !activeIds.has(id))) {
      throw new BadRequestException('A nota referencia um centro de custo invalido ou inativo.');
    }
  }

  private async require(
    organizationId: string,
    id: string,
  ): Promise<InvoiceDocumentRecord> {
    const document = await this.documents.find(organizationId, id);
    if (!document) throw new NotFoundException('Documento fiscal nao encontrado.');
    return document;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : 'Falha inesperada ao processar o documento fiscal.';
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function digitsOnly(value: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}
