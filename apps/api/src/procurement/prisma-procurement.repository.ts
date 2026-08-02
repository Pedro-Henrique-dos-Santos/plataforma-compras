import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type {
  AttachPurchaseInvoiceInput,
  AccountsPayableFilters,
  AccountsPayableReport,
  ApprovalRule,
  ApprovalSettings,
  ApprovalTask,
  ChangePurchaseStatusInput,
  ChangePurchaseWorkflowStageInput,
  CostCenter,
  CreateCostCenterInput,
  CreateApprovalRuleInput,
  CreateSupplierInput,
  CreateSupplierPriceInput,
  DashboardFilters,
  DashboardSummary,
  ImportSupplierPricesInput,
  PriceSource,
  PriceStatus,
  PurchaseImportInput,
  PurchaseImportResult,
  PurchaseDetail,
  PurchaseSource,
  PurchaseSummary,
  PurchaseWorkflowStage,
  ProcurementDetailedReport,
  ProcurementReport,
  ProcurementReportFilters,
  RecordApprovalDecisionInput,
  SchedulePayableInput,
  Supplier,
  SupplierPrice,
  SupplierPriceImportResult,
  UpdateCostCenterInput,
  UpdateApprovalRuleInput,
  UpdateApprovalSettingsInput,
  UpdatePayableInput,
  UpdatePurchaseInput,
  UpdateSupplierInput,
  UpdateSupplierPriceInput,
} from '@compras/contracts';
import { priceSourceSchema, purchaseSourceSchema } from '@compras/contracts';
import { Prisma, type PrismaClient } from '@compras/database';

import { currentBusinessIsoDate } from '../common/business-date.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { buildProcurementReport } from '../reports/procurement-report.builder.js';
import {
  buildDashboardSummary,
  previousDashboardPeriodFilters,
} from './dashboard-summary.builder.js';
import {
  ProcurementRepository,
  type CostCenterFilters,
  type PersistPurchaseInput,
  type PurchaseFilters,
  type SupplierFilters,
  type SupplierPriceFilters,
  type WorkflowTransitionContext,
} from './procurement.repository.js';

const supplierInclude = {
  defaultCostCenter: true,
  _count: { select: { prices: true } },
} satisfies Prisma.SupplierInclude;

const priceInclude = {
  supplier: true,
} satisfies Prisma.SupplierPriceInclude;

const approvalRuleInclude = {
  approvers: {
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ApprovalRuleInclude;

const payablePurchaseInclude = {
  installments: {
    include: {
      fiscalDocument: true,
      instructionSnapshots: { orderBy: { version: 'desc' }, take: 1 },
      settlements: true,
    },
    orderBy: { sequence: 'asc' },
  },
  fiscalDocumentLinks: { include: { invoiceDocument: true } },
  items: {
    include: {
      receiptItems: { where: { receipt: { status: 'CONFIRMED' } } },
    },
  },
  supplier: true,
} satisfies Prisma.PurchaseInclude;

const purchaseInclude = {
  supplier: true,
  items: {
    include: {
      costCenter: true,
      allocations: { include: { costCenter: true } },
    },
  },
  invoiceDocuments: {
    where: { matchStatus: { in: ['MATCHED_EXACT', 'MATCHED_MANUAL'] } },
    select: { id: true },
    take: 1,
  },
  fiscalDocumentLinks: {
    where: { matchStatus: { in: ['MATCHED_EXACT', 'MATCHED_MANUAL'] } },
    select: { id: true },
    take: 1,
  },
  approvalRequests: {
    include: { participants: true, rule: true },
    orderBy: { submittedAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.PurchaseInclude;

const purchaseDetailInclude = {
  supplier: true,
  items: {
    include: {
      costCenter: true,
      allocations: { include: { costCenter: true } },
    },
  },
  installments: { orderBy: { sequence: 'asc' } },
  invoiceDocuments: {
    where: { matchStatus: { in: ['MATCHED_EXACT', 'MATCHED_MANUAL'] } },
    select: {
      id: true,
      invoiceNumber: true,
      accessKey: true,
      issuerDocument: true,
      fiscalIssuedAt: true,
      fiscalTotal: true,
      kind: true,
      matchStatus: true,
      fileName: true,
      storagePath: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  fiscalDocumentLinks: {
    where: { matchStatus: { in: ['MATCHED_EXACT', 'MATCHED_MANUAL'] } },
    include: {
      invoiceDocument: {
        select: {
          id: true,
          invoiceNumber: true,
          accessKey: true,
          issuerDocument: true,
          fiscalIssuedAt: true,
          fiscalTotal: true,
          kind: true,
          matchStatus: true,
          fileName: true,
          storagePath: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  approvalRequests: {
    include: {
      participants: { include: { user: true }, orderBy: { createdAt: 'asc' } },
      rule: true,
    },
    orderBy: { submittedAt: 'desc' },
    take: 1,
  },
  stageHistory: {
    include: { changedBy: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.PurchaseInclude;

const detailedPurchaseInclude = {
  supplier: { include: { defaultCostCenter: true } },
  items: {
    include: {
      costCenter: true,
      allocations: { include: { costCenter: true } },
    },
  },
  installments: { orderBy: { sequence: 'asc' } },
  invoiceDocuments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PurchaseInclude;

type SupplierRecord = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
type PriceRecord = Prisma.SupplierPriceGetPayload<{ include: typeof priceInclude }>;
type ApprovalRuleRecord = Prisma.ApprovalRuleGetPayload<{
  include: typeof approvalRuleInclude;
}>;
type PayablePurchaseRecord = Prisma.PurchaseGetPayload<{
  include: typeof payablePurchaseInclude;
}>;
type PurchaseRecord = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;
type PurchaseDetailRecord = Prisma.PurchaseGetPayload<{
  include: typeof purchaseDetailInclude;
}>;
type DetailedPurchaseRecord = Prisma.PurchaseGetPayload<{
  include: typeof detailedPurchaseInclude;
}>;

export class PrismaProcurementRepository extends ProcurementRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async listCostCenters(
    organizationId: string,
    filters: CostCenterFilters = {},
  ): Promise<CostCenter[]> {
    const centers = await this.prisma.costCenter.findMany({
      where: {
        organizationId,
        ...(!filters.includeInactive && { active: true }),
        ...(filters.search && {
          OR: [
            { code: { contains: filters.search, mode: 'insensitive' } },
            { name: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
    return centers.map(toCostCenter);
  }

  async findCostCenter(organizationId: string, id: string): Promise<CostCenter | null> {
    const center = await this.prisma.costCenter.findFirst({
      where: { id, organizationId },
    });
    return center ? toCostCenter(center) : null;
  }

  async createCostCenter(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateCostCenterInput,
  ): Promise<CostCenter> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const center = await transaction.costCenter.create({
          data: { organizationId, code: input.code, name: input.name },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'cost_center',
            resourceId: center.id,
            metadata: { code: center.code, name: center.name },
          },
        });
        return toCostCenter(center);
      });
    } catch (error) {
      this.throwCenterConflict(error);
    }
  }

  async updateCostCenter(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateCostCenterInput,
  ): Promise<CostCenter> {
    await this.requireCostCenter(organizationId, id, false);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const center = await transaction.costCenter.update({
          where: { id },
          data: input,
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'cost_center',
            resourceId: center.id,
            metadata: input,
          },
        });
        return toCostCenter(center);
      });
    } catch (error) {
      this.throwCenterConflict(error);
    }
  }

  async listSuppliers(
    organizationId: string,
    filters: SupplierFilters = {},
  ): Promise<Supplier[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        organizationId,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            { legalName: { contains: filters.search, mode: 'insensitive' } },
            { tradeName: { contains: filters.search, mode: 'insensitive' } },
            { document: { contains: filters.search, mode: 'insensitive' } },
            { category: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: supplierInclude,
      orderBy: [{ legalName: 'asc' }],
    });
    return suppliers.map(toSupplier);
  }

  async findSupplier(organizationId: string, id: string): Promise<Supplier | null> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
      include: supplierInclude,
    });
    return supplier ? toSupplier(supplier) : null;
  }

  async createSupplier(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierInput,
  ): Promise<Supplier> {
    if (input.defaultCostCenterId) {
      await this.requireCostCenter(organizationId, input.defaultCostCenterId, true);
    }
    try {
      const supplierId = await this.prisma.$transaction(async (transaction) => {
        const supplier = await transaction.supplier.create({
          data: {
            organizationId,
            legalName: input.legalName,
            tradeName: input.tradeName,
            document: input.document,
            category: input.category,
            operationNature: input.operationNature,
            paymentMethod: input.paymentMethod,
            pixKeyType: input.pixKeyType ?? null,
            pixKey: input.pixKey ?? null,
            pixBeneficiaryName: input.pixBeneficiaryName ?? null,
            pixBeneficiaryDocument: input.pixBeneficiaryDocument ?? null,
            paymentLink: input.paymentLink ?? null,
            defaultCostCenterId: input.defaultCostCenterId,
            email: input.email,
            phone: input.phone,
            postalCode: input.postalCode ?? null,
            street: input.street ?? null,
            addressNumber: input.addressNumber ?? null,
            addressComplement: input.addressComplement ?? null,
            district: input.district ?? null,
            city: input.city ?? null,
            state: input.state ?? null,
            registrationStatus: input.registrationStatus ?? null,
            primaryActivity: input.primaryActivity ?? null,
            notes: input.notes,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'supplier',
            resourceId: supplier.id,
            metadata: { legalName: supplier.legalName, document: supplier.document },
          },
        });
        return supplier.id;
      });
      return toSupplier(await this.requireSupplier(organizationId, supplierId, false));
    } catch (error) {
      this.throwSupplierConflict(error);
    }
  }

  async updateSupplier(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierInput,
  ): Promise<Supplier> {
    await this.requireSupplier(organizationId, id, false);
    if (input.defaultCostCenterId) {
      await this.requireCostCenter(organizationId, input.defaultCostCenterId, true);
    }
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.supplier.update({ where: { id }, data: input });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'supplier',
            resourceId: id,
            metadata: input,
          },
        });
      });
      return toSupplier(await this.requireSupplier(organizationId, id, false));
    } catch (error) {
      this.throwSupplierConflict(error);
    }
  }

  async listSupplierPrices(
    organizationId: string,
    filters: SupplierPriceFilters = {},
  ): Promise<SupplierPrice[]> {
    const today = startOfUtcDay(new Date());
    const prices = await this.prisma.supplierPrice.findMany({
      where: {
        organizationId,
        ...(filters.supplierId && { supplierId: filters.supplierId }),
        ...(filters.status === 'INACTIVE' && { status: 'INACTIVE' }),
        ...(filters.status === 'EXPIRED' && {
          status: { not: 'INACTIVE' },
          validUntil: { lt: today },
        }),
        ...(filters.status === 'ACTIVE' && {
          status: 'ACTIVE',
          OR: [{ validUntil: null }, { validUntil: { gte: today } }],
        }),
        ...(filters.search && {
          OR: [
            { itemCode: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
            { supplier: { legalName: { contains: filters.search, mode: 'insensitive' } } },
            { supplier: { tradeName: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }),
      },
      include: priceInclude,
      orderBy: [{ description: 'asc' }],
    });
    return prices.map((price) => toSupplierPrice(price, today));
  }

  async createSupplierPrice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierPriceInput,
  ): Promise<SupplierPrice> {
    await this.requireSupplier(organizationId, input.supplierId, true);
    this.assertPriceValidity(input.validFrom, input.validUntil);
    const duplicate = await this.findMatchingPrice(
      this.prisma,
      organizationId,
      input.supplierId,
      input.itemCode,
      input.description,
      input.unit,
    );
    if (duplicate) {
      throw new ConflictException('Ja existe um preco para este item e fornecedor.');
    }
    try {
      const id = await this.prisma.$transaction(async (transaction) => {
        const price = await transaction.supplierPrice.create({
          data: priceData(organizationId, input.supplierId, input),
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'supplier_price',
            resourceId: price.id,
            metadata: { supplierId: input.supplierId, itemCode: input.itemCode },
          },
        });
        return price.id;
      });
      return await this.requirePrice(organizationId, id);
    } catch (error) {
      this.throwPriceConflict(error);
    }
  }

  async updateSupplierPrice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierPriceInput,
  ): Promise<SupplierPrice> {
    const current = await this.requirePrice(organizationId, id);
    const validFrom = input.validFrom === undefined ? current.validFrom : input.validFrom;
    const validUntil = input.validUntil === undefined ? current.validUntil : input.validUntil;
    this.assertPriceValidity(validFrom, validUntil);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.supplierPrice.update({
          where: { id },
          data: {
            ...input,
            ...(input.description && { normalizedName: normalizeSearch(input.description) }),
            ...(input.validFrom !== undefined && { validFrom: toDate(input.validFrom) }),
            ...(input.validUntil !== undefined && { validUntil: toDate(input.validUntil) }),
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'supplier_price',
            resourceId: id,
            metadata: input,
          },
        });
      });
      return await this.requirePrice(organizationId, id);
    } catch (error) {
      this.throwPriceConflict(error);
    }
  }

  async importSupplierPrices(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: ImportSupplierPricesInput,
  ): Promise<SupplierPriceImportResult> {
    await this.requireSupplier(organizationId, input.supplierId, true);
    return this.prisma.$transaction(async (transaction) => {
      let created = 0;
      let updated = 0;
      for (const item of input.items) {
        this.assertPriceValidity(item.validFrom, item.validUntil);
        const existing = await this.findMatchingPrice(
          transaction,
          organizationId,
          input.supplierId,
          item.itemCode,
          item.description,
          item.unit,
        );
        if (existing) {
          await transaction.supplierPrice.update({
            where: { id: existing.id },
            data: {
              itemCode: item.itemCode,
              description: item.description,
              normalizedName: normalizeSearch(item.description),
              unit: item.unit,
              initialPrice: item.initialPrice,
              negotiatedPrice: item.negotiatedPrice,
              validFrom: toDate(item.validFrom),
              validUntil: toDate(item.validUntil),
              source: 'CSV',
              status: 'ACTIVE',
              notes: item.notes,
            },
          });
          updated += 1;
        } else {
          await transaction.supplierPrice.create({
            data: priceData(organizationId, input.supplierId, { ...item, source: 'CSV' }),
          });
          created += 1;
        }
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'IMPORT',
          resource: 'supplier_price',
          metadata: { supplierId: input.supplierId, total: input.items.length, created, updated },
        },
      });
      return { total: input.items.length, created, updated };
    });
  }

  async listPurchases(
    organizationId: string,
    filters: PurchaseFilters = {},
  ): Promise<PurchaseSummary[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        organizationId,
        ...(filters.status && { status: filters.status }),
        ...(filters.workflowStage && { workflowStage: filters.workflowStage }),
        ...(filters.dateFrom || filters.dateTo
          ? {
              issuedAt: {
                ...(filters.dateFrom && { gte: requiredDate(filters.dateFrom) }),
                ...(filters.dateTo && { lte: requiredDate(filters.dateTo) }),
              },
            }
          : {}),
        ...(filters.search && {
          OR: [
            { number: { contains: filters.search, mode: 'insensitive' } },
            { invoiceNumber: { contains: filters.search, mode: 'insensitive' } },
            { sourceReference: { contains: filters.search, mode: 'insensitive' } },
            { category: { contains: filters.search, mode: 'insensitive' } },
            { supplier: { legalName: { contains: filters.search, mode: 'insensitive' } } },
            { supplier: { tradeName: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }),
      },
      include: purchaseInclude,
      orderBy: [{ issuedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return purchases.map(toPurchaseSummary);
  }

  async getPurchase(organizationId: string, id: string): Promise<PurchaseDetail> {
    return toPurchaseDetail(await this.requirePurchaseDetailRecord(organizationId, id));
  }

  async createPurchase(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PersistPurchaseInput,
  ): Promise<PurchaseSummary> {
    const supplier = await this.requireSupplier(organizationId, input.supplierId, true);
    await this.validatePurchaseCenters(organizationId, supplier, input);
    const calculated = calculatePurchase(input, supplier.defaultCostCenterId);
    const installmentTotal = roundMoney(
      input.installments.reduce((total, installment) => total + installment.amount, 0),
    );
    if (input.installments.length && Math.abs(calculated.total - installmentTotal) > 0.01) {
      throw new BadRequestException('A soma das parcelas deve ser igual ao total da compra.');
    }
    const workflowStage = initialWorkflowStage(input);
    if (
      input.invoiceNumber &&
      workflowStageIndex(workflowStage) < workflowStageIndex('PURCHASE_ORDER')
    ) {
      throw new BadRequestException(
        'A nota fiscal so pode ser vinculada depois da aprovacao da compra.',
      );
    }

    try {
      const id = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`,
        );
        const latestSequence = await transaction.purchase.aggregate({
          where: { organizationId },
          _max: { displaySequence: true },
        });
        const displaySequence = (latestSequence._max.displaySequence ?? 0) + 1;
        const purchase = await transaction.purchase.create({
          data: {
            organization: { connect: { id: organizationId } },
            supplier: {
              connect: {
                organizationId_id: {
                  organizationId,
                  id: input.supplierId,
                },
              },
            },
            displaySequence,
            number: input.number,
            invoiceNumber: input.invoiceNumber ?? null,
            fiscalDocumentRequired: input.fiscalDocumentRequired ?? true,
            issuedAt: toDate(input.issuedAt),
            status: lifecycleStatusForStage(workflowStage),
            workflowStage,
            category: input.category ?? supplier.category,
            operationNature: input.operationNature ?? supplier.operationNature,
            paymentMethod: input.paymentMethod ?? supplier.paymentMethod,
            total: calculated.total,
            negotiatedSavings: calculated.negotiatedSavings,
            source: input.source,
            sourceReference: input.sourceReference,
            notes: input.notes,
            items: {
              create: purchaseItemCreateData(organizationId, calculated.items),
            },
            installments: {
              create: installmentCreateData(input.installments),
            },
          },
        });
        await transaction.purchaseStageHistory.create({
          data: {
            organizationId,
            purchaseId: purchase.id,
            changedById: actor.id,
            toStage: workflowStage,
            reason: 'Compra criada.',
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'purchase',
            resourceId: purchase.id,
            metadata: {
              number: input.number,
              supplierId: input.supplierId,
              source: input.source,
              total: calculated.total,
            },
          },
        });
        return purchase.id;
      });
      return await this.requirePurchase(organizationId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Esta compra ja foi registrada.');
      }
      throw error;
    }
  }

  async updatePurchase(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdatePurchaseInput,
    context: WorkflowTransitionContext = {},
  ): Promise<PurchaseDetail> {
    const current = await this.requirePurchaseDetailRecord(organizationId, id);
    if (current.status === 'CANCELLED') {
      throw new BadRequestException('Reative a compra antes de altera-la.');
    }
    const adminOverride =
      actor.platformRoles.includes('PLATFORM_OWNER') ||
      context.organizationRole === 'ORGANIZATION_ADMIN';
    const isEarlyStage =
      current.workflowStage === 'REGISTRATION' ||
      current.workflowStage === 'REQUESTED';
    if (!isEarlyStage && !adminOverride) {
      throw new BadRequestException(
        'Itens e valores nao podem ser alterados depois do envio para aprovacao.',
      );
    }
    if (!isEarlyStage && adminOverride) {
      const [fiscalLinks, directDocuments, receipts, settlements, legacyPaidTitles] =
        await Promise.all([
          this.prisma.purchaseInvoiceLink.count({ where: { organizationId, purchaseId: id } }),
          this.prisma.invoiceDocument.count({ where: { organizationId, purchaseId: id } }),
          this.prisma.goodsReceipt.count({
            where: { organizationId, purchaseId: id, status: 'CONFIRMED' },
          }),
          this.prisma.paymentSettlement.count({
            where: { organizationId, installment: { purchaseId: id } },
          }),
          this.prisma.installment.count({
            where: { organizationId, purchaseId: id, paidAt: { not: null } },
          }),
        ]);
      if (fiscalLinks + directDocuments + receipts + settlements + legacyPaidTitles > 0) {
        throw new BadRequestException(
          'Este pedido possui evidencia fiscal, recebimento ou pagamento. Corrija esses registros vinculados antes de alterar itens e valores.',
        );
      }
    }
    if (input.invoiceNumber && input.invoiceNumber !== current.invoiceNumber) {
      throw new BadRequestException(
        'Vincule a nota fiscal pela automacao de documentos depois da aprovacao.',
      );
    }
    const supplier = await this.requireSupplier(
      organizationId,
      input.supplierId,
      input.supplierId !== current.supplierId,
    );
    const persistedInput: PersistPurchaseInput = {
      number: input.number,
      invoiceNumber: input.invoiceNumber ?? null,
      fiscalDocumentRequired:
        input.fiscalDocumentRequired ?? current.fiscalDocumentRequired,
      supplierId: input.supplierId,
      issuedAt: input.issuedAt,
      category: input.category,
      operationNature: input.operationNature,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      source: parsePurchaseSource(current.source),
      sourceReference: current.sourceReference,
      workflowStage: current.workflowStage,
      items: input.items,
      installments: input.installments,
    };
    await this.validatePurchaseCenters(
      organizationId,
      supplier,
      persistedInput,
      purchaseCenterIds(current),
    );
    const calculated = calculatePurchase(persistedInput, supplier.defaultCostCenterId);
    validateInstallmentTotal(calculated.total, persistedInput.installments);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.purchase.updateMany({
          where: {
            id,
            organizationId,
            updatedAt: new Date(input.expectedUpdatedAt),
          },
          data: {
            supplierId: input.supplierId,
            number: input.number,
            invoiceNumber: input.invoiceNumber ?? null,
            fiscalDocumentRequired:
              input.fiscalDocumentRequired ?? current.fiscalDocumentRequired,
            issuedAt: toDate(input.issuedAt),
            category: input.category ?? supplier.category,
            operationNature: input.operationNature ?? supplier.operationNature,
            paymentMethod: input.paymentMethod ?? supplier.paymentMethod,
            total: calculated.total,
            negotiatedSavings: calculated.negotiatedSavings,
            notes: input.notes,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
        }
        const currentInstallments = await transaction.installment.findMany({
          where: { organizationId, purchaseId: id },
          orderBy: { sequence: 'asc' },
        });
        validatePaidInstallmentsUnchanged(currentInstallments, persistedInput.installments);
        await transaction.purchaseItem.deleteMany({
          where: { organizationId, purchaseId: id },
        });
        await transaction.installment.deleteMany({
          where: { organizationId, purchaseId: id, paidAt: null },
        });
        const purchase = await transaction.purchase.update({
          where: { organizationId_id: { organizationId, id } },
          data: {
            items: { create: purchaseItemCreateData(organizationId, calculated.items) },
            installments: {
              create: installmentCreateData(
                persistedInput.installments,
                currentInstallments,
              ),
            },
          },
          include: purchaseDetailInclude,
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'purchase',
            resourceId: id,
            metadata: {
              before: {
                number: current.number,
                supplierId: current.supplierId,
                total: Number(current.total),
              },
              after: {
                number: input.number,
                supplierId: input.supplierId,
                total: calculated.total,
              },
            },
          },
        });
        return toPurchaseDetail(purchase);
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Ja existe uma compra com estes dados.');
      }
      throw error;
    }
  }

  async changePurchaseStatus(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseStatusInput,
  ): Promise<PurchaseSummary> {
    const current = await this.requirePurchaseDetailRecord(organizationId, id);
    if (current.status === input.status) {
      return toPurchaseSummary(current);
    }
    await this.prisma.$transaction(async (transaction) => {
      const nextStage =
        input.status === 'CANCELLED' &&
        current.workflowStage === 'AWAITING_APPROVAL'
          ? 'REQUESTED'
          : current.workflowStage;
      const nextStatus =
        input.status === 'CANCELLED'
          ? 'CANCELLED'
          : lifecycleStatusForStage(nextStage);
      const updated = await transaction.purchase.updateMany({
        where: {
          id,
          organizationId,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: { status: nextStatus, workflowStage: nextStage },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
      }
      if (input.status === 'CANCELLED') {
        await transaction.purchaseApprovalRequest.updateMany({
          where: { organizationId, purchaseId: id, status: 'PENDING' },
          data: { resolvedAt: new Date(), status: 'CANCELLED' },
        });
      }
      if (nextStage !== current.workflowStage) {
        await transaction.purchaseStageHistory.create({
          data: {
            organizationId,
            purchaseId: id,
            changedById: actor.id,
            fromStage: current.workflowStage,
            toStage: nextStage,
            reason: input.reason,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'purchase_status',
          resourceId: id,
          metadata: {
            from: current.status,
            reason: input.reason,
            to: nextStatus,
          },
        },
      });
    });
    return this.requirePurchase(organizationId, id);
  }

  async changePurchaseWorkflowStage(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseWorkflowStageInput,
    context: WorkflowTransitionContext = {},
  ): Promise<PurchaseDetail> {
    const current = await this.requirePurchaseDetailRecord(organizationId, id);
    if (current.status === 'CANCELLED') {
      throw new BadRequestException('Reative a compra antes de alterar o fluxo.');
    }
    if (current.workflowStage === input.stage) {
      return toPurchaseDetail(current);
    }
    const settings = await this.getApprovalSettings(organizationId);
    assertManualStageTransition(
      current.workflowStage,
      input.stage,
      input.reason ?? null,
      current.invoiceDocuments.length > 0 || current.fiscalDocumentLinks.length > 0,
      {
        adminOverride:
          actor.platformRoles.includes('PLATFORM_OWNER') ||
          context.organizationRole === 'ORGANIZATION_ADMIN',
        automated: context.automated === true,
        requireReturnReason: settings.requireStageReturnReason,
      },
    );

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.purchase.updateMany({
        where: {
          id,
          organizationId,
          updatedAt: new Date(input.expectedUpdatedAt),
          workflowStage: current.workflowStage,
        },
        data: {
          workflowStage: input.stage,
          status: lifecycleStatusForStage(input.stage),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
      }
      if (
        current.workflowStage === 'AWAITING_APPROVAL' &&
        workflowStageIndex(input.stage) < workflowStageIndex(current.workflowStage)
      ) {
        await transaction.purchaseApprovalRequest.updateMany({
          where: { organizationId, purchaseId: id, status: 'PENDING' },
          data: { resolvedAt: new Date(), status: 'CANCELLED' },
        });
      }
      await transaction.purchaseStageHistory.create({
        data: {
          organizationId,
          purchaseId: id,
          changedById: actor.id,
          fromStage: current.workflowStage,
          toStage: input.stage,
          reason: input.reason ?? null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'purchase_workflow_stage',
          resourceId: id,
          metadata: {
            from: current.workflowStage,
            reason: input.reason ?? null,
            to: input.stage,
          },
        },
      });
    });
    return toPurchaseDetail(await this.requirePurchaseDetailRecord(organizationId, id));
  }

  async submitPurchaseForApproval(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    expectedUpdatedAt: string,
  ): Promise<PurchaseDetail> {
    const purchase = await this.requirePurchaseDetailRecord(organizationId, id);
    if (purchase.status === 'CANCELLED' || purchase.workflowStage !== 'REQUESTED') {
      throw new BadRequestException(
        'A compra precisa estar na etapa Solicitacao para ser enviada a aprovacao.',
      );
    }
    const rule = await this.prisma.approvalRule.findFirst({
      where: {
        organizationId,
        active: true,
        minimumAmount: { lte: purchase.total },
      },
      include: approvalRuleInclude,
      orderBy: { minimumAmount: 'desc' },
    });
    if (!rule) {
      throw new BadRequestException(
        'Nenhuma regra de aprovacao ativa atende ao valor desta compra.',
      );
    }
    const approvers = await this.requireActiveApprovers(
      organizationId,
      rule.approvers.map((approver) => approver.userId),
      rule.notificationChannel,
    );
    if (approvers.length < rule.requiredApprovals) {
      throw new BadRequestException(
        'A regra nao possui aprovadores ativos suficientes para o quorum configurado.',
      );
    }

    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const updated = await transaction.purchase.updateMany({
            where: {
              id,
              organizationId,
              updatedAt: new Date(expectedUpdatedAt),
              workflowStage: 'REQUESTED',
            },
            data: {
              status: 'DRAFT',
              workflowStage: 'AWAITING_APPROVAL',
            },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'A compra foi alterada por outro usuario. Atualize os dados.',
            );
          }
          const request = await transaction.purchaseApprovalRequest.create({
            data: {
              organizationId,
              purchaseId: id,
              ruleId: rule.id,
              submittedById: actor.id,
              ruleNameSnapshot: rule.name,
              notificationChannel: rule.notificationChannel,
              amountSnapshot: purchase.total,
              requiredApprovals: rule.requiredApprovals,
              participants: {
                create: approvers.map((approver) => ({
                  organizationId,
                  userId: approver.id,
                  nameSnapshot: approver.name,
                  recipientSnapshot: approver.recipient,
                  channel: rule.notificationChannel,
                })),
              },
            },
          });
          await transaction.purchaseStageHistory.create({
            data: {
              organizationId,
              purchaseId: id,
              changedById: actor.id,
              fromStage: 'REQUESTED',
              toStage: 'AWAITING_APPROVAL',
              reason: `Enviado para ${rule.requiredApprovals} aprovacao(oes).`,
            },
          });
          await transaction.notificationOutbox.createMany({
            data: approvers.map((approver) => ({
              organizationId,
              deduplicationKey: `${request.id}:approval-request:${approver.id}`,
              eventType: 'PURCHASE_APPROVAL_REQUESTED',
              channel: rule.notificationChannel,
              recipient: approver.recipient,
              subject: `Compra ${purchase.number} aguardando aprovacao`,
              payload: approvalNotificationPayload({
                approvalRequestId: request.id,
                purchaseId: purchase.id,
                purchaseNumber: purchase.number,
                supplierName:
                  purchase.supplier.tradeName ?? purchase.supplier.legalName,
                total: Number(purchase.total),
              }),
            })),
            skipDuplicates: true,
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              organizationId,
              action: 'UPDATE',
              resource: 'purchase_approval',
              resourceId: request.id,
              metadata: {
                purchaseId: id,
                ruleId: rule.id,
                requiredApprovals: rule.requiredApprovals,
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isTransactionConflict(error)) {
        throw new ConflictException(
          'A solicitacao de aprovacao concorreu com outra alteracao. Tente novamente.',
        );
      }
      throw error;
    }
    return toPurchaseDetail(await this.requirePurchaseDetailRecord(organizationId, id));
  }

  async recordApprovalDecision(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: RecordApprovalDecisionInput,
  ): Promise<PurchaseDetail> {
    let purchaseId = '';
    try {
      purchaseId = await this.prisma.$transaction(
        async (transaction) => {
          const participant = await transaction.purchaseApprovalParticipant.findFirst({
            where: {
              organizationId,
              requestId: input.requestId,
              userId: actor.id,
            },
            include: {
              request: {
                include: {
                  participants: true,
                  purchase: {
                    include: {
                      installments: { orderBy: { sequence: 'asc' } },
                      supplier: true,
                    },
                  },
                  submittedBy: true,
                },
              },
            },
          });
          if (!participant || participant.request.status !== 'PENDING') {
            throw new NotFoundException('Aprovacao pendente nao encontrada para este usuario.');
          }
          if (participant.decision !== 'PENDING') {
            throw new ConflictException('Esta aprovacao ja foi respondida.');
          }
          const now = new Date();
          const decided = await transaction.purchaseApprovalParticipant.updateMany({
            where: { id: participant.id, decision: 'PENDING' },
            data: {
              comment: input.comment,
              decidedAt: now,
              decision: input.decision,
            },
          });
          if (decided.count !== 1) {
            throw new ConflictException('Esta aprovacao ja foi respondida.');
          }

          const request = participant.request;
          const purchase = request.purchase;
          if (input.decision === 'REJECTED') {
            await transaction.purchaseApprovalRequest.update({
              where: { id: request.id },
              data: { resolvedAt: now, status: 'REJECTED' },
            });
            await transaction.purchase.update({
              where: { id: purchase.id },
              data: { status: 'DRAFT', workflowStage: 'REQUESTED' },
            });
            await transaction.purchaseStageHistory.create({
              data: {
                organizationId,
                purchaseId: purchase.id,
                changedById: actor.id,
                fromStage: 'AWAITING_APPROVAL',
                toStage: 'REQUESTED',
                reason: input.comment,
              },
            });
            const submitterRecipient = optionalNotificationRecipient(
              request.submittedBy,
              request.notificationChannel,
            );
            if (submitterRecipient) {
              await transaction.notificationOutbox.create({
                data: {
                  organizationId,
                  deduplicationKey: `${request.id}:approval-rejected`,
                  eventType: 'PURCHASE_APPROVAL_REJECTED',
                  channel: request.notificationChannel,
                  recipient: submitterRecipient,
                  subject: `Compra ${purchase.number} reprovada`,
                  payload: {
                    ...approvalNotificationPayload({
                      approvalRequestId: request.id,
                      purchaseId: purchase.id,
                      purchaseNumber: purchase.number,
                      supplierName:
                        purchase.supplier.tradeName ?? purchase.supplier.legalName,
                      total: Number(purchase.total),
                    }),
                    comment: input.comment,
                  },
                },
              });
            }
          } else {
            const approvedCount = await transaction.purchaseApprovalParticipant.count({
              where: { requestId: request.id, decision: 'APPROVED' },
            });
            if (approvedCount >= request.requiredApprovals) {
              const resolved = await transaction.purchaseApprovalRequest.updateMany({
                where: { id: request.id, status: 'PENDING' },
                data: { resolvedAt: now, status: 'APPROVED' },
              });
              if (resolved.count !== 1) {
                throw new ConflictException('Esta solicitacao ja foi concluida.');
              }
              await transaction.purchase.update({
                where: { id: purchase.id },
                data: { status: 'REGISTERED', workflowStage: 'PURCHASE_ORDER' },
              });
              await transaction.purchaseStageHistory.create({
                data: {
                  organizationId,
                  purchaseId: purchase.id,
                  changedById: actor.id,
                  fromStage: 'AWAITING_APPROVAL',
                  toStage: 'PURCHASE_ORDER',
                  reason: `Quorum de ${request.requiredApprovals} aprovacao(oes) atingido.`,
                },
              });
              const settings = await transaction.approvalSettings.findUnique({
                where: { organizationId },
              });
              if (
                settings?.notifyFinanceOnApproval &&
                settings.financeChannel &&
                settings.financeRecipient
              ) {
                await transaction.notificationOutbox.create({
                  data: {
                    organizationId,
                    deduplicationKey: `${request.id}:finance-approved`,
                    eventType: 'PURCHASE_APPROVED_FOR_PAYMENT',
                    channel: settings.financeChannel,
                    recipient: settings.financeRecipient,
                    subject: `Compra ${purchase.number} aprovada para pagamento`,
                    payload: financeNotificationPayload(purchase),
                  },
                });
              }
            }
          }
          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              organizationId,
              action: 'UPDATE',
              resource: 'purchase_approval_decision',
              resourceId: participant.id,
              metadata: {
                comment: input.comment,
                decision: input.decision,
                purchaseId: purchase.id,
                requestId: request.id,
              },
            },
          });
          return purchase.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isTransactionConflict(error)) {
        throw new ConflictException(
          'Outra decisao foi registrada ao mesmo tempo. Atualize a solicitacao.',
        );
      }
      throw error;
    }
    return toPurchaseDetail(
      await this.requirePurchaseDetailRecord(organizationId, purchaseId),
    );
  }

  async listApprovalTasks(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<ApprovalTask[]> {
    const participants = await this.prisma.purchaseApprovalParticipant.findMany({
      where: {
        organizationId,
        userId: actor.id,
        decision: 'PENDING',
        request: { status: 'PENDING' },
      },
      include: {
        request: {
          include: {
            participants: true,
            purchase: { include: { supplier: true } },
          },
        },
      },
      orderBy: { request: { submittedAt: 'asc' } },
    });
    return participants.map(({ request }) => ({
      requestId: request.id,
      purchaseId: request.purchaseId,
      purchaseNumber: request.purchase.number,
      supplierName:
        request.purchase.supplier.tradeName ?? request.purchase.supplier.legalName,
      total: Number(request.amountSnapshot),
      category: request.purchase.category,
      submittedAt: request.submittedAt.toISOString(),
      approvedCount: request.participants.filter(
        (participant) => participant.decision === 'APPROVED',
      ).length,
      requiredApprovals: request.requiredApprovals,
    }));
  }

  async listApprovalRules(organizationId: string): Promise<ApprovalRule[]> {
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId },
      include: approvalRuleInclude,
      orderBy: { minimumAmount: 'asc' },
    });
    return rules.map(toApprovalRule);
  }

  async createApprovalRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateApprovalRuleInput,
  ): Promise<ApprovalRule> {
    await this.requireActiveApprovers(
      organizationId,
      input.approverUserIds,
      input.notificationChannel,
    );
    try {
      const ruleId = await this.prisma.$transaction(async (transaction) => {
        const rule = await transaction.approvalRule.create({
          data: {
            organizationId,
            name: input.name,
            minimumAmount: input.minimumAmount,
            requiredApprovals: input.requiredApprovals,
            notificationChannel: input.notificationChannel,
            active: input.active,
            approvers: {
              create: input.approverUserIds.map((userId) => ({
                organizationId,
                userId,
              })),
            },
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'CREATE',
            resource: 'approval_rule',
            resourceId: rule.id,
            metadata: {
              minimumAmount: input.minimumAmount,
              requiredApprovals: input.requiredApprovals,
            },
          },
        });
        return rule.id;
      });
      return await this.requireApprovalRule(organizationId, ruleId);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Ja existe uma regra para este valor minimo.');
      }
      throw error;
    }
  }

  async updateApprovalRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateApprovalRuleInput,
  ): Promise<ApprovalRule> {
    await this.requireApprovalRule(organizationId, id);
    await this.requireActiveApprovers(
      organizationId,
      input.approverUserIds,
      input.notificationChannel,
    );
    try {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.approvalRule.updateMany({
          where: {
            id,
            organizationId,
            updatedAt: new Date(input.expectedUpdatedAt),
          },
          data: {
            active: input.active,
            minimumAmount: input.minimumAmount,
            name: input.name,
            notificationChannel: input.notificationChannel,
            requiredApprovals: input.requiredApprovals,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'A regra foi alterada por outro usuario. Atualize os dados.',
          );
        }
        await transaction.approvalRuleApprover.deleteMany({
          where: { organizationId, ruleId: id },
        });
        await transaction.approvalRuleApprover.createMany({
          data: input.approverUserIds.map((userId) => ({
            organizationId,
            ruleId: id,
            userId,
          })),
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'approval_rule',
            resourceId: id,
            metadata: {
              active: input.active,
              minimumAmount: input.minimumAmount,
              requiredApprovals: input.requiredApprovals,
            },
          },
        });
      });
      return await this.requireApprovalRule(organizationId, id);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Ja existe uma regra para este valor minimo.');
      }
      throw error;
    }
  }

  async getApprovalSettings(organizationId: string): Promise<ApprovalSettings> {
    const settings = await this.prisma.approvalSettings.findUnique({
      where: { organizationId },
    });
    return settings
      ? {
          financeChannel: settings.financeChannel,
          financeRecipient: settings.financeRecipient,
          notifyFinanceOnApproval: settings.notifyFinanceOnApproval,
          requireStageReturnReason: settings.requireStageReturnReason,
          updatedAt: settings.updatedAt.toISOString(),
        }
      : {
          financeChannel: null,
          financeRecipient: null,
          notifyFinanceOnApproval: false,
          requireStageReturnReason: false,
          updatedAt: null,
        };
  }

  async updateApprovalSettings(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpdateApprovalSettingsInput,
  ): Promise<ApprovalSettings> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.approvalSettings.upsert({
        where: { organizationId },
        update: input,
        create: { organizationId, ...input },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'approval_settings',
          resourceId: organizationId,
          metadata: {
            financeChannel: input.financeChannel,
            hasFinanceRecipient: input.financeRecipient !== null,
            notifyFinanceOnApproval: input.notifyFinanceOnApproval,
            requireStageReturnReason: input.requireStageReturnReason,
          },
        },
      });
    });
    return this.getApprovalSettings(organizationId);
  }

  async getAccountsPayable(
    organizationId: string,
    filters: AccountsPayableFilters,
  ): Promise<AccountsPayableReport> {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        organizationId,
        status: { not: 'CANCELLED' },
        workflowStage: {
          in: [
            'PURCHASE_ORDER',
            'SUPPLIER_INVOICED',
            'RECEIVED',
            'COMPLETED',
          ],
        },
        ...(filters.supplierId && { supplierId: filters.supplierId }),
        ...(filters.workflowStage && { workflowStage: filters.workflowStage }),
      },
      include: payablePurchaseInclude,
      orderBy: [{ issuedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return buildAccountsPayableReport('DATABASE', purchases, filters);
  }

  async schedulePayable(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: SchedulePayableInput,
  ): Promise<PurchaseDetail> {
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        organizationId,
        status: { not: 'CANCELLED' },
        workflowStage: {
          in: [
            'PURCHASE_ORDER',
            'SUPPLIER_INVOICED',
            'RECEIVED',
            'COMPLETED',
          ],
        },
      },
      include: { installments: { select: { id: true } } },
    });
    if (!purchase) {
      throw new NotFoundException('Compra aprovada nao encontrada.');
    }
    if (purchase.installments.length) {
      throw new BadRequestException('Esta compra ja possui parcelas cadastradas.');
    }
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.purchase.updateMany({
        where: {
          id: purchaseId,
          organizationId,
          updatedAt: new Date(input.expectedUpdatedAt),
          status: { not: 'CANCELLED' },
          workflowStage: {
            in: [
              'PURCHASE_ORDER',
              'SUPPLIER_INVOICED',
              'RECEIVED',
              'COMPLETED',
            ],
          },
        },
        data: { updatedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'A compra foi alterada por outro usuario. Atualize os dados.',
        );
      }
      const installment = await transaction.installment.create({
        data: {
          organizationId,
          purchaseId,
          sequence: 1,
          dueDate: requiredDate(input.dueDate),
          amount: purchase.total,
          paymentChannel: input.paymentChannel,
          paymentReference: input.paymentReference,
          paymentNotes: input.paymentNotes,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'CREATE',
          resource: 'accounts_payable',
          resourceId: installment.id,
          metadata: {
            amount: Number(purchase.total),
            dueDate: input.dueDate,
            paymentChannel: input.paymentChannel,
            purchaseId,
            sequence: 1,
          },
        },
      });
    });
    return toPurchaseDetail(
      await this.requirePurchaseDetailRecord(organizationId, purchaseId),
    );
  }

  async updatePayable(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    sequence: number,
    input: UpdatePayableInput,
  ): Promise<PurchaseDetail> {
    if (input.paidAt !== undefined) {
      throw new BadRequestException(
        'Registre o pagamento no fluxo financeiro com valor, identificador e comprovante.',
      );
    }
    if (sequence < 1) {
      throw new BadRequestException('A compra ainda nao possui parcelas para alterar.');
    }
    const installment = await this.prisma.installment.findFirst({
      where: {
        organizationId,
        purchaseId,
        sequence,
        purchase: {
          status: { not: 'CANCELLED' },
          workflowStage: {
            in: [
              'PURCHASE_ORDER',
              'SUPPLIER_INVOICED',
              'RECEIVED',
              'COMPLETED',
            ],
          },
        },
      },
      include: { purchase: true },
    });
    if (!installment) {
      throw new NotFoundException('Conta a pagar nao encontrada.');
    }
    await this.prisma.$transaction(async (transaction) => {
      const purchaseUpdated = await transaction.purchase.updateMany({
        where: {
          id: purchaseId,
          organizationId,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: { updatedAt: new Date() },
      });
      if (purchaseUpdated.count !== 1) {
        throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
      }
      await transaction.installment.update({
        where: { purchaseId_sequence: { purchaseId, sequence } },
        data: {
          ...(input.dueDate !== undefined && { dueDate: requiredDate(input.dueDate) }),
          ...(input.paymentChannel !== undefined && {
            paymentChannel: input.paymentChannel,
          }),
          ...(input.paymentReference !== undefined && {
            paymentReference: input.paymentReference,
          }),
          ...(input.paymentNotes !== undefined && {
            paymentNotes: input.paymentNotes,
          }),
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          organizationId,
          action: 'UPDATE',
          resource: 'accounts_payable',
          resourceId: installment.id,
          metadata: {
            paymentChannel: input.paymentChannel,
            purchaseId,
            sequence,
          },
        },
      });
    });
    return toPurchaseDetail(
      await this.requirePurchaseDetailRecord(organizationId, purchaseId),
    );
  }

  async importPurchases(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PurchaseImportInput,
  ): Promise<PurchaseImportResult> {
    let created = 0;
    let duplicated = 0;
    for (const purchase of input.purchases) {
      try {
        await this.createPurchase(actor, organizationId, purchase);
        created += 1;
      } catch (error) {
        if (error instanceof ConflictException) {
          duplicated += 1;
          continue;
        }
        throw error;
      }
    }
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        organizationId,
        action: 'IMPORT',
        resource: 'purchase',
        metadata: { total: input.purchases.length, created, duplicated },
      },
    });
    return { total: input.purchases.length, created, duplicated };
  }

  async attachPurchaseInvoice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: AttachPurchaseInvoiceInput,
  ): Promise<PurchaseSummary> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, organizationId },
      select: {
        id: true,
        invoiceNumber: true,
        supplierId: true,
        workflowStage: true,
      },
    });
    if (!purchase) {
      throw new NotFoundException('Compra nao encontrada.');
    }
    if (workflowStageIndex(purchase.workflowStage) < workflowStageIndex('PURCHASE_ORDER')) {
      throw new BadRequestException(
        'A nota fiscal so pode ser vinculada depois da aprovacao da compra.',
      );
    }
    try {
      await this.prisma.$transaction(async (transaction) => {
        const nextStage =
          purchase.workflowStage === 'PURCHASE_ORDER'
            ? 'SUPPLIER_INVOICED'
            : purchase.workflowStage;
        await transaction.purchase.update({
          where: { id: purchaseId },
          data: { invoiceNumber: input.invoiceNumber, workflowStage: nextStage },
        });
        if (nextStage !== purchase.workflowStage) {
          await transaction.purchaseStageHistory.create({
            data: {
              organizationId,
              purchaseId,
              changedById: actor.id,
              fromStage: purchase.workflowStage,
              toStage: nextStage,
              reason: 'Nota fiscal vinculada.',
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            organizationId,
            action: 'UPDATE',
            resource: 'purchase_invoice',
            resourceId: purchaseId,
            metadata: { invoiceNumber: input.invoiceNumber, supplierId: purchase.supplierId },
          },
        });
      });
      return await this.requirePurchase(organizationId, purchaseId);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Esta nota fiscal ja esta vinculada a outra compra.');
      }
      throw error;
    }
  }

  async getDashboardSummary(
    organizationId: string,
    filters: DashboardFilters,
  ): Promise<DashboardSummary> {
    const previousFilters = previousDashboardPeriodFilters(filters);
    const [activeSuppliers, purchases, previousAggregate] = await Promise.all([
      this.prisma.supplier.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.purchase.findMany({
        where: dashboardWhere(organizationId, filters),
        include: purchaseInclude,
      }),
      previousFilters
        ? this.prisma.purchase.aggregate({
            where: dashboardWhere(organizationId, previousFilters),
            _sum: {
              total: true,
              negotiatedSavings: true,
            },
          })
        : Promise.resolve(null),
    ]);
    return buildDashboardSummary({
      activeSuppliers,
      dataSource: 'DATABASE',
      filters,
      previousPeriodTotals: previousAggregate
        ? {
            purchased: Number(previousAggregate._sum.total ?? 0),
            negotiatedSavings: Number(previousAggregate._sum.negotiatedSavings ?? 0),
          }
        : null,
      purchases: purchases.map(toDashboardPurchase),
    });
  }

  async getProcurementReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementReport> {
    const purchases = await this.prisma.purchase.findMany({
      where: procurementReportWhere(organizationId, filters),
      include: purchaseInclude,
      orderBy: [{ issuedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    return buildProcurementReport({
      dataSource: 'DATABASE',
      filters,
      purchases: purchases.map(toReportPurchase),
    });
  }

  async getProcurementDetailedReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementDetailedReport> {
    const purchases = await this.prisma.purchase.findMany({
      where: procurementReportWhere(organizationId, filters),
      include: detailedPurchaseInclude,
      orderBy: [{ issuedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    const summary = buildProcurementReport({
      dataSource: 'DATABASE',
      filters,
      purchases: purchases.map(toReportPurchase),
    });
    return {
      summary,
      purchases: purchases.map(toDetailedReportPurchase),
    };
  }

  private async requireCostCenter(
    organizationId: string,
    id: string,
    requireActive: boolean,
  ) {
    const center = await this.prisma.costCenter.findFirst({
      where: { id, organizationId, ...(requireActive && { active: true }) },
    });
    if (!center) {
      throw requireActive
        ? new BadRequestException('Centro de custo invalido ou inativo.')
        : new NotFoundException('Centro de custo nao encontrado.');
    }
    return center;
  }

  private async requireSupplier(
    organizationId: string,
    id: string,
    requireActive: boolean,
  ): Promise<SupplierRecord> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId, ...(requireActive && { status: 'ACTIVE' }) },
      include: supplierInclude,
    });
    if (!supplier) {
      throw requireActive
        ? new BadRequestException('Fornecedor invalido ou inativo.')
        : new NotFoundException('Fornecedor nao encontrado.');
    }
    return supplier;
  }

  private async requirePrice(organizationId: string, id: string): Promise<SupplierPrice> {
    const price = await this.prisma.supplierPrice.findFirst({
      where: { id, organizationId },
      include: priceInclude,
    });
    if (!price) {
      throw new NotFoundException('Preco negociado nao encontrado.');
    }
    return toSupplierPrice(price, startOfUtcDay(new Date()));
  }

  private async requireApprovalRule(
    organizationId: string,
    id: string,
  ): Promise<ApprovalRule> {
    const rule = await this.prisma.approvalRule.findFirst({
      where: { id, organizationId },
      include: approvalRuleInclude,
    });
    if (!rule) {
      throw new NotFoundException('Regra de aprovacao nao encontrada.');
    }
    return toApprovalRule(rule);
  }

  private async requireActiveApprovers(
    organizationId: string,
    userIds: string[],
    channel: 'EMAIL' | 'WHATSAPP',
  ) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        userId: { in: userIds },
        user: { active: true },
        OR: [
          { role: { in: ['ORGANIZATION_ADMIN', 'BUYER'] } },
          {
            user: {
              platformRoles: {
                some: { role: 'PLATFORM_OWNER' },
              },
            },
          },
        ],
      },
      include: { user: true },
    });
    if (memberships.length !== userIds.length) {
      throw new BadRequestException(
        'Todos os aprovadores devem ser usuarios ativos desta empresa.',
      );
    }
    const membershipByUser = new Map(
      memberships.map((membership) => [membership.userId, membership]),
    );
    return userIds.map((userId) => {
      const membership = membershipByUser.get(userId);
      if (!membership) {
        throw new BadRequestException('Aprovador ativo nao encontrado.');
      }
      return {
        id: userId,
        name: membership.user.name,
        recipient: requiredNotificationRecipient(membership.user, channel),
      };
    });
  }

  private async requirePurchase(
    organizationId: string,
    id: string,
  ): Promise<PurchaseSummary> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, organizationId },
      include: purchaseInclude,
    });
    if (!purchase) {
      throw new NotFoundException('Compra nao encontrada.');
    }
    return toPurchaseSummary(purchase);
  }

  private async requirePurchaseDetailRecord(
    organizationId: string,
    id: string,
  ): Promise<PurchaseDetailRecord> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, organizationId },
      include: purchaseDetailInclude,
    });
    if (!purchase) {
      throw new NotFoundException('Compra nao encontrada.');
    }
    return purchase;
  }

  private async validatePurchaseCenters(
    organizationId: string,
    supplier: SupplierRecord,
    input: PersistPurchaseInput,
    allowedInactiveIds: ReadonlySet<string> = new Set(),
  ) {
    const ids = new Set<string>();
    for (const item of input.items) {
      const directCenter = item.allocations.length
        ? null
        : item.costCenterId ?? supplier.defaultCostCenterId;
      if (directCenter) ids.add(directCenter);
      for (const allocation of item.allocations) ids.add(allocation.costCenterId);
    }
    if (!ids.size) return;
    const centers = await this.prisma.costCenter.findMany({
      where: { organizationId, id: { in: [...ids] } },
      select: { active: true, id: true },
    });
    if (
      centers.length !== ids.size ||
      centers.some((center) => !center.active && !allowedInactiveIds.has(center.id))
    ) {
      throw new BadRequestException('Um ou mais centros de custo sao invalidos ou inativos.');
    }
  }

  private async findMatchingPrice(
    client: PrismaClient | Prisma.TransactionClient,
    organizationId: string,
    supplierId: string,
    itemCode: string | null,
    description: string,
    unit: string | null,
  ) {
    return client.supplierPrice.findFirst({
      where: {
        organizationId,
        supplierId,
        ...(itemCode
          ? { itemCode: { equals: itemCode, mode: 'insensitive' } }
          : {
              itemCode: null,
              normalizedName: normalizeSearch(description),
              unit: unit ? { equals: unit, mode: 'insensitive' } : null,
            }),
      },
    });
  }

  private assertPriceValidity(validFrom: string | null, validUntil: string | null) {
    if (validFrom && validUntil && validUntil < validFrom) {
      throw new BadRequestException('A validade final deve ser igual ou posterior a inicial.');
    }
  }

  private throwCenterConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw new ConflictException('Ja existe um centro de custo com este codigo.');
    }
    throw error;
  }

  private throwSupplierConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw new ConflictException('Ja existe um fornecedor com este CNPJ.');
    }
    throw error;
  }

  private throwPriceConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw new ConflictException('Ja existe um preco para este item e fornecedor.');
    }
    throw error;
  }
}

function procurementReportWhere(
  organizationId: string,
  filters: ProcurementReportFilters,
): Prisma.PurchaseWhereInput {
  return {
    organizationId,
    ...(filters.status && { status: filters.status }),
    ...(filters.workflowStage && { workflowStage: filters.workflowStage }),
    ...(filters.dateFrom || filters.dateTo
      ? {
          issuedAt: {
            ...(filters.dateFrom && { gte: requiredDate(filters.dateFrom) }),
            ...(filters.dateTo && { lte: requiredDate(filters.dateTo) }),
          },
        }
      : {}),
    ...(filters.supplierId && { supplierId: filters.supplierId }),
    ...(filters.category && {
      category: { equals: filters.category, mode: 'insensitive' },
    }),
    ...(filters.costCenterId && {
      items: {
        some: {
          OR: [
            { costCenterId: filters.costCenterId },
            { allocations: { some: { costCenterId: filters.costCenterId } } },
          ],
        },
      },
    }),
  };
}

function dashboardWhere(
  organizationId: string,
  filters: DashboardFilters,
): Prisma.PurchaseWhereInput {
  return {
    organizationId,
    status: 'REGISTERED',
    ...(filters.dateFrom || filters.dateTo
      ? {
          issuedAt: {
            ...(filters.dateFrom && { gte: requiredDate(filters.dateFrom) }),
            ...(filters.dateTo && { lte: requiredDate(filters.dateTo) }),
          },
        }
      : !filters.includeUndated
        ? { issuedAt: { not: null } }
        : {}),
    ...(filters.supplierId && { supplierId: filters.supplierId }),
    ...(filters.category && {
      category: { equals: filters.category, mode: 'insensitive' },
    }),
    ...(filters.costCenterId && {
      items: {
        some: {
          OR: [
            { costCenterId: filters.costCenterId },
            { allocations: { some: { costCenterId: filters.costCenterId } } },
          ],
        },
      },
    }),
  };
}

function toCostCenter(center: {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CostCenter {
  return {
    id: center.id,
    code: center.code,
    name: center.name,
    active: center.active,
    createdAt: center.createdAt.toISOString(),
    updatedAt: center.updatedAt.toISOString(),
  };
}

function toSupplier(supplier: SupplierRecord): Supplier {
  return {
    id: supplier.id,
    legalName: supplier.legalName,
    tradeName: supplier.tradeName,
    document: supplier.document,
    category: supplier.category,
    operationNature: supplier.operationNature,
    paymentMethod: supplier.paymentMethod,
    pixKeyType: supplier.pixKeyType,
    pixKey: supplier.pixKey,
    pixBeneficiaryName: supplier.pixBeneficiaryName,
    pixBeneficiaryDocument: supplier.pixBeneficiaryDocument,
    paymentLink: supplier.paymentLink,
    defaultCostCenterId: supplier.defaultCostCenterId,
    defaultCostCenterName: supplier.defaultCostCenter?.name ?? null,
    email: supplier.email,
    phone: supplier.phone,
    postalCode: supplier.postalCode,
    street: supplier.street,
    addressNumber: supplier.addressNumber,
    addressComplement: supplier.addressComplement,
    district: supplier.district,
    city: supplier.city,
    state: supplier.state,
    registrationStatus: supplier.registrationStatus,
    primaryActivity: supplier.primaryActivity,
    status: supplier.status,
    notes: supplier.notes,
    priceCount: supplier._count.prices,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

function toApprovalRule(rule: ApprovalRuleRecord): ApprovalRule {
  return {
    id: rule.id,
    name: rule.name,
    minimumAmount: Number(rule.minimumAmount),
    requiredApprovals: rule.requiredApprovals,
    notificationChannel: rule.notificationChannel,
    active: rule.active,
    approvers: rule.approvers.map((approver) => ({
      userId: approver.userId,
      name: approver.user.name,
      email: approver.user.email,
      phone: approver.user.phone,
    })),
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function toSupplierPrice(price: PriceRecord, today: Date): SupplierPrice {
  const initialPrice = price.initialPrice === null ? null : Number(price.initialPrice);
  const negotiatedPrice = Number(price.negotiatedPrice);
  const status: PriceStatus =
    price.status === 'ACTIVE' && price.validUntil && price.validUntil < today
      ? 'EXPIRED'
      : price.status;
  return {
    id: price.id,
    supplierId: price.supplierId,
    supplierName: price.supplier.tradeName ?? price.supplier.legalName,
    itemCode: price.itemCode,
    description: price.description,
    unit: price.unit,
    initialPrice,
    negotiatedPrice,
    savingsPercentage:
      initialPrice && initialPrice > 0
        ? Math.round(((initialPrice - negotiatedPrice) / initialPrice) * 1_000) / 10
        : null,
    validFrom: toIsoDate(price.validFrom),
    validUntil: toIsoDate(price.validUntil),
    status,
    source: parsePriceSource(price.source),
    notes: price.notes,
    createdAt: price.createdAt.toISOString(),
    updatedAt: price.updatedAt.toISOString(),
  };
}

function toPurchaseSummary(purchase: PurchaseRecord): PurchaseSummary {
  return {
    id: purchase.id,
    displayNumber: purchase.displaySequence,
    number: purchase.number,
    invoiceNumber: purchase.invoiceNumber,
    fiscalDocumentRequired: purchase.fiscalDocumentRequired,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
    issuedAt: toIsoDate(purchase.issuedAt),
    status: purchase.status,
    category: purchase.category,
    paymentMethod: purchase.paymentMethod,
    total: Number(purchase.total),
    negotiatedSavings: Number(purchase.negotiatedSavings),
    departments: [
      ...new Set(
        purchase.items.flatMap((item) =>
          item.allocations.length
            ? item.allocations.map((allocation) => allocation.costCenter.name)
            : item.costCenter
              ? [item.costCenter.name]
              : [],
        ),
      ),
    ],
    itemCount: purchase.items.length,
    source: parsePurchaseSource(purchase.source),
    sourceReference: purchase.sourceReference,
    createdAt: purchase.createdAt.toISOString(),
    updatedAt: purchase.updatedAt.toISOString(),
    workflowStage: purchase.workflowStage,
    invoiceLinked:
      purchase.invoiceDocuments.length > 0 ||
      purchase.fiscalDocumentLinks.length > 0,
    approval: purchase.approvalRequests[0]
      ? toApprovalSummary(purchase.approvalRequests[0])
      : null,
  };
}

function toDashboardPurchase(purchase: PurchaseRecord) {
  return {
    id: purchase.number,
    supplier: purchase.supplier.tradeName ?? purchase.supplier.legalName,
    issuedAt: purchase.issuedAt,
    createdAt: purchase.createdAt,
    total: Number(purchase.total),
    negotiatedSavings: Number(purchase.negotiatedSavings),
    category: purchase.category,
    items: purchase.items.map((item) => ({
      total: Number(item.total),
      costCenter: item.costCenter?.name ?? null,
      allocations: item.allocations.map((allocation) => ({
        costCenter: allocation.costCenter.name,
        amount: Number(allocation.amount),
      })),
    })),
  };
}

function toReportPurchase(purchase: PurchaseRecord | DetailedPurchaseRecord) {
  return {
    id: purchase.id,
    number: purchase.number,
    invoiceNumber: purchase.invoiceNumber,
    issuedAt: toIsoDate(purchase.issuedAt),
    supplierId: purchase.supplierId,
    supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
    category: purchase.category,
    source: parsePurchaseSource(purchase.source),
    status: purchase.status,
    workflowStage: purchase.workflowStage,
    itemCount: purchase.items.length,
    total: Number(purchase.total),
    negotiatedSavings: Number(purchase.negotiatedSavings),
    departmentAllocations: purchase.items.flatMap((item) =>
      item.allocations.length
        ? item.allocations.map((allocation) => ({
            departmentId: allocation.costCenterId,
            departmentName: allocation.costCenter.name,
            amount: Number(allocation.amount),
          }))
        : [
            {
              departmentId: item.costCenterId ?? 'unallocated',
              departmentName: item.costCenter?.name ?? 'Sem centro de custo',
              amount: Number(item.total),
            },
          ],
    ),
  };
}

function toPurchaseDetail(purchase: PurchaseDetailRecord): PurchaseDetail {
  return {
    ...toPurchaseSummary(purchase),
    operationNature: purchase.operationNature,
    notes: purchase.notes,
    items: purchase.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      negotiatedPrice: item.negotiatedPrice === null ? null : Number(item.negotiatedPrice),
      total: Number(item.total),
      costCenterId: item.costCenterId,
      costCenterName: item.costCenter?.name ?? null,
      allocations: item.allocations.map((allocation) => ({
        costCenterId: allocation.costCenterId,
        costCenterName: allocation.costCenter.name,
        percentage: Number(allocation.percentage),
        amount: Number(allocation.amount),
      })),
    })),
    installments: purchase.installments.map((installment) => ({
      sequence: installment.sequence,
      dueDate: toIsoDate(installment.dueDate) as string,
      amount: Number(installment.amount),
      paidAt: toIsoDate(installment.paidAt),
      paymentChannel: installment.paymentChannel,
      paymentReference: installment.paymentReference,
      paymentNotes: installment.paymentNotes,
    })),
    approval: purchase.approvalRequests[0]
      ? {
          ...toApprovalSummary(purchase.approvalRequests[0]),
          amountSnapshot: Number(purchase.approvalRequests[0].amountSnapshot),
          participants: purchase.approvalRequests[0].participants.map((participant) => ({
            userId: participant.userId,
            name: participant.nameSnapshot,
            decision: participant.decision,
            comment: participant.comment,
            decidedAt: participant.decidedAt?.toISOString() ?? null,
          })),
        }
      : null,
    fiscalDocuments: toPurchaseFiscalDocuments(purchase),
    stageHistory: purchase.stageHistory.map((history) => ({
      id: history.id,
      fromStage: history.fromStage,
      toStage: history.toStage,
      changedById: history.changedById,
      changedByName: history.changedBy?.name ?? 'Automacao do sistema',
      reason: history.reason,
      createdAt: history.createdAt.toISOString(),
    })),
  };
}

function toPurchaseFiscalDocuments(
  purchase: PurchaseDetailRecord,
): PurchaseDetail['fiscalDocuments'] {
  type FiscalRecord = PurchaseDetailRecord['invoiceDocuments'][number];
  const documents = new Map<
    string,
    { document: FiscalRecord; matchStatus: FiscalRecord['matchStatus'] }
  >();

  for (const link of purchase.fiscalDocumentLinks) {
    documents.set(link.invoiceDocument.id, {
      document: link.invoiceDocument,
      matchStatus: link.matchStatus,
    });
  }
  for (const document of purchase.invoiceDocuments) {
    if (!documents.has(document.id)) {
      documents.set(document.id, { document, matchStatus: document.matchStatus });
    }
  }

  const issuerName = purchase.supplier.tradeName ?? purchase.supplier.legalName;
  const result: PurchaseDetail['fiscalDocuments'] = [...documents.values()].map(
    ({ document, matchStatus }) => ({
      id: document.id,
      invoiceNumber: document.invoiceNumber,
      accessKey: document.accessKey,
      issuerName,
      issuerDocument: document.issuerDocument,
      issuedAt: document.fiscalIssuedAt?.toISOString() ?? null,
      total: document.fiscalTotal === null ? null : Number(document.fiscalTotal),
      kind: document.kind,
      matchStatus,
      fileName: document.fileName,
      fileAvailable: Boolean(document.storagePath),
      legacy: false,
    }),
  );

  return result;
}

function toDetailedReportPurchase(purchase: DetailedPurchaseRecord) {
  return {
    id: purchase.id,
    number: purchase.number,
    invoiceNumber: purchase.invoiceNumber,
    issuedAt: toIsoDate(purchase.issuedAt),
    status: purchase.status,
    workflowStage: purchase.workflowStage,
    category: purchase.category,
    operationNature: purchase.operationNature,
    paymentMethod: purchase.paymentMethod,
    notes: purchase.notes,
    source: parsePurchaseSource(purchase.source),
    sourceReference: purchase.sourceReference,
    total: Number(purchase.total),
    negotiatedSavings: Number(purchase.negotiatedSavings),
    createdAt: purchase.createdAt.toISOString(),
    supplier: {
      id: purchase.supplier.id,
      legalName: purchase.supplier.legalName,
      tradeName: purchase.supplier.tradeName,
      document: purchase.supplier.document,
      category: purchase.supplier.category,
      operationNature: purchase.supplier.operationNature,
      paymentMethod: purchase.supplier.paymentMethod,
      pixKeyType: purchase.supplier.pixKeyType,
      pixKey: purchase.supplier.pixKey,
      paymentLink: purchase.supplier.paymentLink,
      email: purchase.supplier.email,
      phone: purchase.supplier.phone,
      defaultCostCenter: purchase.supplier.defaultCostCenter
        ? {
            id: purchase.supplier.defaultCostCenter.id,
            code: purchase.supplier.defaultCostCenter.code,
            name: purchase.supplier.defaultCostCenter.name,
          }
        : null,
    },
    items: purchase.items.map((item) => {
      const unitPrice = Number(item.unitPrice);
      const negotiatedPrice = item.negotiatedPrice === null ? null : Number(item.negotiatedPrice);
      return {
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice,
        negotiatedPrice,
        total: Number(item.total),
        negotiatedSavings: roundMoney(
          Math.max(0, unitPrice - (negotiatedPrice ?? unitPrice)) * Number(item.quantity),
        ),
        costCenter: item.costCenter
          ? {
              id: item.costCenter.id,
              code: item.costCenter.code,
              name: item.costCenter.name,
            }
          : null,
        allocations: item.allocations.map((allocation) => ({
          costCenter: {
            id: allocation.costCenter.id,
            code: allocation.costCenter.code,
            name: allocation.costCenter.name,
          },
          percentage: Number(allocation.percentage),
          amount: Number(allocation.amount),
        })),
      };
    }),
    installments: purchase.installments.map((installment) => ({
      sequence: installment.sequence,
      dueDate: toIsoDate(installment.dueDate) as string,
      amount: Number(installment.amount),
      paidAt: toIsoDate(installment.paidAt),
      paymentChannel: installment.paymentChannel,
      paymentReference: installment.paymentReference,
      paymentNotes: installment.paymentNotes,
    })),
    invoices: purchase.invoiceDocuments.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      accessKey: invoice.accessKey,
      fileName: invoice.fileName,
      kind: invoice.kind,
      status: invoice.status,
      parser: invoice.parser,
      confidence: invoice.confidence === null ? null : Number(invoice.confidence),
      warningCount: jsonArrayLength(invoice.warnings),
      errorCount: jsonArrayLength(invoice.errors),
      processedAt: invoice.processedAt?.toISOString() ?? null,
      reviewedAt: invoice.reviewedAt?.toISOString() ?? null,
      importedAt: invoice.importedAt?.toISOString() ?? null,
    })),
  };
}

function jsonArrayLength(value: Prisma.JsonValue): number {
  return Array.isArray(value) ? value.length : 0;
}

function priceData(
  organizationId: string,
  supplierId: string,
  input: Omit<CreateSupplierPriceInput, 'supplierId'> | CreateSupplierPriceInput,
): Prisma.SupplierPriceUncheckedCreateInput {
  return {
    organizationId,
    supplierId,
    itemCode: input.itemCode,
    description: input.description,
    normalizedName: normalizeSearch(input.description),
    unit: input.unit,
    initialPrice: input.initialPrice,
    negotiatedPrice: input.negotiatedPrice,
    validFrom: toDate(input.validFrom),
    validUntil: toDate(input.validUntil),
    status: 'ACTIVE',
    source: input.source,
    notes: input.notes,
  };
}

function calculatePurchase(input: PersistPurchaseInput, supplierCenterId: string | null) {
  const items = input.items.map((item) => {
    const finalPrice = item.negotiatedPrice ?? item.unitPrice;
    const total = roundMoney(item.quantity * finalPrice);
    return {
      ...item,
      total,
      costCenterId: item.allocations.length
        ? null
        : item.costCenterId ?? supplierCenterId,
      allocations: allocateAmounts(total, item.allocations),
    };
  });
  return {
    items,
    total: roundMoney(items.reduce((total, item) => total + item.total, 0)),
    negotiatedSavings: roundMoney(
      input.items.reduce(
        (total, item) =>
          total +
          Math.max(0, item.unitPrice - (item.negotiatedPrice ?? item.unitPrice)) *
            item.quantity,
        0,
      ),
    ),
  };
}

function purchaseItemCreateData(
  organizationId: string,
  items: ReturnType<typeof calculatePurchase>['items'],
) {
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    negotiatedPrice: item.negotiatedPrice,
    total: item.total,
    ...(item.costCenterId && {
      costCenter: {
        connect: {
          organizationId_id: {
            organizationId,
            id: item.costCenterId,
          },
        },
      },
    }),
    allocations: {
      create: item.allocations.map((allocation) => ({
        percentage: allocation.percentage,
        amount: allocation.amount,
        costCenter: {
          connect: {
            organizationId_id: {
              organizationId,
              id: allocation.costCenterId,
            },
          },
        },
      })),
    },
  }));
}

function installmentCreateData(
  installments: PersistPurchaseInput['installments'],
  currentInstallments: Array<{ paidAt: Date | null; sequence: number }> = [],
) {
  const paidSequences = new Set(
    currentInstallments
      .filter((installment) => installment.paidAt !== null)
      .map((installment) => installment.sequence),
  );
  return installments
    .map((installment, index) => ({
      sequence: index + 1,
      dueDate: toDate(installment.dueDate) as Date,
      amount: installment.amount,
      paymentChannel: installment.paymentChannel ?? null,
      paymentReference: installment.paymentReference ?? null,
      paymentNotes: installment.paymentNotes ?? null,
    }))
    .filter((installment) => !paidSequences.has(installment.sequence));
}

function validatePaidInstallmentsUnchanged(
  currentInstallments: Array<{
    amount: Prisma.Decimal;
    dueDate: Date;
    paidAt: Date | null;
    sequence: number;
  }>,
  requestedInstallments: PersistPurchaseInput['installments'],
) {
  for (const current of currentInstallments) {
    if (!current.paidAt) continue;
    const requested = requestedInstallments[current.sequence - 1];
    if (
      !requested ||
      requested.dueDate !== toIsoDate(current.dueDate) ||
      Math.abs(requested.amount - Number(current.amount)) > 0.01
    ) {
      throw new BadRequestException(
        'Parcelas pagas nao podem ser alteradas, reordenadas ou removidas.',
      );
    }
  }
}

function purchaseCenterIds(purchase: PurchaseDetailRecord): Set<string> {
  return new Set(
    purchase.items.flatMap((item) => [
      ...(item.costCenterId ? [item.costCenterId] : []),
      ...item.allocations.map((allocation) => allocation.costCenterId),
    ]),
  );
}

function validateInstallmentTotal(
  purchaseTotal: number,
  installments: PersistPurchaseInput['installments'],
) {
  if (!installments.length) {
    return;
  }
  const installmentTotal = roundMoney(
    installments.reduce((total, installment) => total + installment.amount, 0),
  );
  if (Math.abs(purchaseTotal - installmentTotal) > 0.01) {
    throw new BadRequestException('A soma das parcelas deve ser igual ao total da compra.');
  }
}

function allocateAmounts(
  total: number,
  allocations: Array<{ costCenterId: string; percentage: number }>,
) {
  let allocated = 0;
  return allocations.map((allocation, index) => {
    const amount =
      index === allocations.length - 1
        ? roundMoney(total - allocated)
        : roundMoney((total * allocation.percentage) / 100);
    allocated = roundMoney(allocated + amount);
    return { ...allocation, amount };
  });
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function requiredDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parsePriceSource(source: string): PriceSource {
  return priceSourceSchema.parse(source);
}

function parsePurchaseSource(source: string): PurchaseSource {
  return purchaseSourceSchema.parse(source);
}

function initialWorkflowStage(input: PersistPurchaseInput): PurchaseWorkflowStage {
  if (input.workflowStage) {
    return input.workflowStage;
  }
  if (input.source === 'INVOICE') {
    return 'SUPPLIER_INVOICED';
  }
  if (input.source === 'CSV' || input.source === 'GOOGLE_SHEETS') {
    return 'PURCHASE_ORDER';
  }
  return 'REGISTRATION';
}

function lifecycleStatusForStage(stage: PurchaseWorkflowStage): 'DRAFT' | 'REGISTERED' {
  return workflowStageIndex(stage) >= workflowStageIndex('PURCHASE_ORDER')
    ? 'REGISTERED'
    : 'DRAFT';
}

const orderedWorkflowStages: PurchaseWorkflowStage[] = [
  'REGISTRATION',
  'REQUESTED',
  'AWAITING_APPROVAL',
  'PURCHASE_ORDER',
  'SUPPLIER_INVOICED',
  'RECEIVED',
  'COMPLETED',
];

function workflowStageIndex(stage: PurchaseWorkflowStage): number {
  return orderedWorkflowStages.indexOf(stage);
}

function assertManualStageTransition(
  from: PurchaseWorkflowStage,
  to: PurchaseWorkflowStage,
  reason: string | null,
  invoiceLinked: boolean,
  options: {
    adminOverride: boolean;
    automated: boolean;
    requireReturnReason: boolean;
  },
) {
  const movingBackwards = workflowStageIndex(to) < workflowStageIndex(from);
  if (options.automated) {
    if (workflowStageIndex(to) !== workflowStageIndex(from) + 1) {
      throw new BadRequestException('A automacao tentou ignorar uma etapa do fluxo de compras.');
    }
    return;
  }

  const allowed: Record<PurchaseWorkflowStage, PurchaseWorkflowStage[]> = {
    REGISTRATION: ['REQUESTED'],
    REQUESTED: ['REGISTRATION'],
    AWAITING_APPROVAL: [],
    PURCHASE_ORDER: ['REQUESTED', 'SUPPLIER_INVOICED'],
    SUPPLIER_INVOICED: ['PURCHASE_ORDER', 'RECEIVED'],
    RECEIVED: ['SUPPLIER_INVOICED', 'COMPLETED'],
    COMPLETED: ['RECEIVED'],
  };
  if (!allowed[from].includes(to) && !(options.adminOverride && movingBackwards)) {
    if (to === 'AWAITING_APPROVAL' || to === 'PURCHASE_ORDER') {
      throw new BadRequestException(
        'Use a acao de enviar para aprovacao; estas etapas nao podem ser ignoradas.',
      );
    }
    throw new BadRequestException('Esta mudanca de etapa nao e permitida.');
  }
  if (workflowStageIndex(to) > workflowStageIndex(from)) {
    if (to === 'SUPPLIER_INVOICED') {
      throw new BadRequestException(
        'Vincule uma nota fiscal ao pedido; o faturamento e atualizado pela conciliacao fiscal.',
      );
    }
    if (to === 'RECEIVED') {
      throw new BadRequestException(
        'Confirme os itens recebidos; o recebimento nao pode ser avancado manualmente.',
      );
    }
    if (to === 'COMPLETED') {
      throw new BadRequestException(
        'O pedido sera concluido quando estiver integralmente recebido e sem saldo financeiro.',
      );
    }
  }
  if (
    (to === 'SUPPLIER_INVOICED' || to === 'COMPLETED') &&
    !invoiceLinked
  ) {
    throw new BadRequestException(
      'Vincule uma nota fiscal antes de concluir esta etapa.',
    );
  }
  if (workflowStageIndex(to) < workflowStageIndex('PURCHASE_ORDER') && invoiceLinked) {
    throw new BadRequestException(
      'Uma compra com nota fiscal vinculada nao pode voltar para antes do pedido de compra.',
    );
  }
  if (movingBackwards && options.requireReturnReason && !reason) {
    throw new BadRequestException('Informe o motivo para retornar a compra de etapa.');
  }
}

function requiredNotificationRecipient(
  user: { email: string; phone: string | null },
  channel: 'EMAIL' | 'WHATSAPP',
): string {
  const recipient = optionalNotificationRecipient(user, channel);
  if (!recipient) {
    throw new BadRequestException(
      channel === 'EMAIL'
        ? 'O aprovador precisa ter um e-mail valido.'
        : 'O aprovador precisa ter um WhatsApp no formato internacional.',
    );
  }
  return recipient;
}

function optionalNotificationRecipient(
  user: { email: string; phone: string | null },
  channel: 'EMAIL' | 'WHATSAPP',
): string | null {
  if (channel === 'EMAIL') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ? user.email : null;
  }
  return /^\+[1-9]\d{9,14}$/.test(user.phone ?? '') ? user.phone : null;
}

function approvalNotificationPayload(input: {
  approvalRequestId: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierName: string;
  total: number;
}) {
  return {
    kind: 'PURCHASE_APPROVAL',
    approvalRequestId: input.approvalRequestId,
    purchaseId: input.purchaseId,
    purchaseNumber: input.purchaseNumber,
    supplierName: input.supplierName,
    total: input.total,
    appPath: '/approvals',
  };
}

function financeNotificationPayload(purchase: {
  id: string;
  number: string;
  total: Prisma.Decimal;
  supplier: {
    legalName: string;
    tradeName: string | null;
    pixKeyType: string | null;
    pixKey: string | null;
    paymentLink: string | null;
  };
  installments: Array<{
    sequence: number;
    dueDate: Date;
    amount: Prisma.Decimal;
    paymentChannel: string | null;
    paymentReference: string | null;
  }>;
}) {
  return {
    kind: 'PURCHASE_APPROVED_FOR_PAYMENT',
    purchaseId: purchase.id,
    purchaseNumber: purchase.number,
    supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
    total: Number(purchase.total),
    supplierPayment: {
      pixKeyType: purchase.supplier.pixKeyType,
      pixKey: purchase.supplier.pixKey,
      paymentLink: purchase.supplier.paymentLink,
    },
    installments: purchase.installments.map((installment) => ({
      sequence: installment.sequence,
      dueDate: toIsoDate(installment.dueDate),
      amount: Number(installment.amount),
      paymentChannel:
        installment.paymentChannel ??
        defaultSupplierPaymentChannel(purchase.supplier),
      paymentReference:
        installment.paymentReference ??
        defaultSupplierPaymentReference(purchase.supplier),
    })),
    appPath: '/payables',
  };
}

function buildAccountsPayableReport(
  dataSource: AccountsPayableReport['dataSource'],
  purchases: PayablePurchaseRecord[],
  filters: AccountsPayableFilters,
): AccountsPayableReport {
  const today = currentBusinessIsoDate();
  const allRows: AccountsPayableReport['rows'] = [];
  for (const purchase of purchases) {
    const defaultChannel = defaultSupplierPaymentChannel(purchase.supplier);
    const defaultReference = defaultSupplierPaymentReference(purchase.supplier);
    const linkedInvoiceNumbers = payableInvoiceNumbers(purchase);
    const received =
      purchase.items.length > 0 &&
      purchase.items.every(
        (item) =>
          roundMoney(
            item.receiptItems.reduce(
              (sum, receiptItem) => sum + Number(receiptItem.quantity),
              0,
            ),
          ) >= Number(item.quantity) - 0.0001,
      );
    if (!purchase.installments.length) {
      allRows.push({
        id: `unscheduled-${purchase.id}`,
        purchaseId: purchase.id,
        purchaseNumber: purchase.number,
        purchaseUpdatedAt: purchase.updatedAt.toISOString(),
        invoiceNumber: linkedInvoiceNumbers[0] ?? purchase.invoiceNumber,
        invoiceNumbers: linkedInvoiceNumbers,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
        sequence: 0,
        dueDate: null,
        amount: Number(purchase.total),
        paidAmount: 0,
        balance: Number(purchase.total),
        paidAt: null,
        status: 'UNSCHEDULED',
        paymentChannel: defaultChannel,
        paymentReference: defaultReference,
        paymentNotes: null,
        paymentWorkflowStage: null,
        received,
        advancePayment: false,
        settlementCount: 0,
        workflowStage: purchase.workflowStage,
      });
      continue;
    }
    for (const installment of purchase.installments) {
      const dueDate = toIsoDate(installment.dueDate) as string;
      const paidAt = toIsoDate(installment.paidAt);
      const settlementTotal = roundMoney(
        installment.settlements.reduce(
          (sum, settlement) => sum + Number(settlement.amount),
          0,
        ),
      );
      const amount = Number(installment.amount);
      const paidAmount = installment.paidAt && settlementTotal === 0
        ? amount
        : settlementTotal;
      const balance = Math.max(0, roundMoney(amount - paidAmount));
      const instruction = installment.instructionSnapshots[0];
      const invoiceNumbers = [
        ...new Set([
          ...linkedInvoiceNumbers,
          ...(installment.fiscalDocument?.invoiceNumber
            ? [installment.fiscalDocument.invoiceNumber]
            : []),
        ]),
      ];
      const status =
        balance <= 0.001
          ? 'PAID'
          : dueDate < today
            ? 'OVERDUE'
            : paidAmount > 0.001
              ? 'PARTIALLY_PAID'
              : 'PENDING';
      allRows.push({
        id: installment.id,
        purchaseId: purchase.id,
        purchaseNumber: purchase.number,
        purchaseUpdatedAt: purchase.updatedAt.toISOString(),
        invoiceNumber: invoiceNumbers[0] ?? purchase.invoiceNumber,
        invoiceNumbers,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
        sequence: installment.sequence,
        dueDate,
        amount,
        paidAmount,
        balance,
        paidAt,
        status,
        paymentChannel:
          instruction?.paymentChannel ?? installment.paymentChannel ?? defaultChannel,
        paymentReference:
          instruction?.paymentReference ??
          instruction?.pixCopyPaste ??
          instruction?.pixKey ??
          installment.paymentReference ??
          defaultReference,
        paymentNotes: instruction?.notes ?? installment.paymentNotes,
        paymentWorkflowStage: balance <= 0.001 ? 'PAID' : installment.paymentStage,
        received,
        advancePayment: installment.advancePayment,
        settlementCount: installment.settlements.length,
        workflowStage: purchase.workflowStage,
      });
    }
  }
  const rows = allRows
    .filter((row) => !filters.status || row.status === filters.status)
    .filter(
      (row) =>
        !filters.paymentChannel || row.paymentChannel === filters.paymentChannel,
    )
    .filter(
      (row) =>
        (!filters.dateFrom ||
          (row.dueDate !== null && row.dueDate >= filters.dateFrom)) &&
        (!filters.dateTo ||
          (row.dueDate !== null && row.dueDate <= filters.dateTo)),
    )
    .sort(
      (left, right) =>
        (left.dueDate ?? '9999-12-31').localeCompare(
          right.dueDate ?? '9999-12-31',
        ) || left.purchaseNumber.localeCompare(right.purchaseNumber),
    );

  const dueIn = (days: number) => {
    const end = addIsoDays(today, days);
    return roundMoney(
      rows
        .filter(
          (row) =>
            (row.status === 'PENDING' || row.status === 'PARTIALLY_PAID') &&
            row.dueDate !== null &&
            row.dueDate >= today &&
            row.dueDate <= end,
        )
        .reduce((sum, row) => sum + row.balance, 0),
    );
  };
  return {
    dataSource,
    generatedAt: new Date().toISOString(),
    totals: {
      open: roundMoney(
        rows
          .filter((row) =>
            ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(row.status),
          )
          .reduce((sum, row) => sum + row.balance, 0),
      ),
      overdue: roundMoney(
        rows
          .filter((row) => row.status === 'OVERDUE')
          .reduce((sum, row) => sum + row.balance, 0),
      ),
      dueIn7Days: dueIn(7),
      dueIn15Days: dueIn(15),
      dueIn30Days: dueIn(30),
      paid: roundMoney(
        rows.reduce((sum, row) => sum + row.paidAmount, 0),
      ),
      unscheduled: roundMoney(
        rows
          .filter((row) => row.status === 'UNSCHEDULED')
          .reduce((sum, row) => sum + row.amount, 0),
      ),
      rowCount: rows.length,
    },
    rows,
  };
}

function payableInvoiceNumbers(purchase: PayablePurchaseRecord): string[] {
  return [
    ...new Set(
      purchase.fiscalDocumentLinks
        .filter((link) =>
          ['MATCHED_EXACT', 'MATCHED_MANUAL'].includes(link.matchStatus),
        )
        .map((link) => link.invoiceDocument.invoiceNumber)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function defaultSupplierPaymentChannel(supplier: {
  pixKey: string | null;
  paymentLink: string | null;
}) {
  if (supplier.pixKey) return 'PIX' as const;
  if (supplier.paymentLink) return 'CARD_LINK' as const;
  return null;
}

function defaultSupplierPaymentReference(supplier: {
  pixKey: string | null;
  paymentLink: string | null;
}) {
  return supplier.pixKey ?? supplier.paymentLink ?? null;
}

function addIsoDays(value: string, days: number): string {
  const date = requiredDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date) as string;
}

function toApprovalSummary(
  request: PurchaseRecord['approvalRequests'][number] | PurchaseDetailRecord['approvalRequests'][number],
) {
  return {
    requestId: request.id,
    status: request.status,
    ruleName: request.ruleNameSnapshot,
    requiredApprovals: request.requiredApprovals,
    approvedCount: request.participants.filter(
      (participant) => participant.decision === 'APPROVED',
    ).length,
    rejectedCount: request.participants.filter(
      (participant) => participant.decision === 'REJECTED',
    ).length,
    approvedBy: request.participants
      .filter(
        (participant): participant is typeof participant & { decidedAt: Date } =>
          participant.decision === 'APPROVED' && participant.decidedAt !== null,
      )
      .map((participant) => ({
        userId: participant.userId,
        name: participant.nameSnapshot,
        decidedAt: (participant.decidedAt as Date).toISOString(),
      })),
    submittedAt: request.submittedAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
