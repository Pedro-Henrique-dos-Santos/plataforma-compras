import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type {
  AttachPurchaseInvoiceInput,
  CostCenter,
  CreateCostCenterInput,
  CreatePurchaseInput,
  CreateSupplierInput,
  CreateSupplierPriceInput,
  DashboardSummary,
  ImportSupplierPricesInput,
  PriceSource,
  PriceStatus,
  PurchaseImportInput,
  PurchaseImportResult,
  PurchaseSource,
  PurchaseSummary,
  ProcurementReport,
  ProcurementReportFilters,
  Supplier,
  SupplierPrice,
  SupplierPriceImportResult,
  UpdateCostCenterInput,
  UpdateSupplierInput,
  UpdateSupplierPriceInput,
} from '@compras/contracts';
import { priceSourceSchema, purchaseSourceSchema } from '@compras/contracts';
import { Prisma, type PrismaClient } from '@compras/database';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { buildProcurementReport } from '../reports/procurement-report.builder.js';
import { buildDashboardSummary } from './dashboard-summary.builder.js';
import {
  ProcurementRepository,
  type CostCenterFilters,
  type PurchaseFilters,
  type SupplierFilters,
  type SupplierPriceFilters,
} from './procurement.repository.js';

const supplierInclude = {
  defaultCostCenter: true,
  _count: { select: { prices: true } },
} satisfies Prisma.SupplierInclude;

const priceInclude = {
  supplier: true,
} satisfies Prisma.SupplierPriceInclude;

const purchaseInclude = {
  supplier: true,
  items: {
    include: {
      costCenter: true,
      allocations: { include: { costCenter: true } },
    },
  },
} satisfies Prisma.PurchaseInclude;

type SupplierRecord = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
type PriceRecord = Prisma.SupplierPriceGetPayload<{ include: typeof priceInclude }>;
type PurchaseRecord = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

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
            defaultCostCenterId: input.defaultCostCenterId,
            email: input.email,
            phone: input.phone,
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
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return purchases.map(toPurchaseSummary);
  }

  async createPurchase(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreatePurchaseInput,
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

    try {
      const id = await this.prisma.$transaction(async (transaction) => {
        const purchase = await transaction.purchase.create({
          data: {
            organizationId,
            supplierId: input.supplierId,
            number: input.number,
            invoiceNumber: input.invoiceNumber ?? null,
            issuedAt: toDate(input.issuedAt) as Date,
            status: 'REGISTERED',
            category: input.category ?? supplier.category,
            operationNature: input.operationNature ?? supplier.operationNature,
            paymentMethod: input.paymentMethod ?? supplier.paymentMethod,
            total: calculated.total,
            negotiatedSavings: calculated.negotiatedSavings,
            source: input.source,
            sourceReference: input.sourceReference,
            notes: input.notes,
            items: {
              create: calculated.items.map((item) => ({
                organizationId,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                negotiatedPrice: item.negotiatedPrice,
                total: item.total,
                costCenterId: item.costCenterId,
                allocations: {
                  create: item.allocations.map((allocation) => ({
                    organizationId,
                    costCenterId: allocation.costCenterId,
                    percentage: allocation.percentage,
                    amount: allocation.amount,
                  })),
                },
              })),
            },
            installments: {
              create: input.installments.map((installment, index) => ({
                organizationId,
                sequence: index + 1,
                dueDate: toDate(installment.dueDate) as Date,
                amount: installment.amount,
              })),
            },
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
      select: { id: true, supplierId: true },
    });
    if (!purchase) {
      throw new NotFoundException('Compra nao encontrada.');
    }
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.purchase.update({
          where: { id: purchaseId },
          data: { invoiceNumber: input.invoiceNumber },
        });
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

  async getDashboardSummary(organizationId: string): Promise<DashboardSummary> {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const [activeSuppliers, purchases] = await Promise.all([
      this.prisma.supplier.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.purchase.findMany({
        where: { organizationId, status: 'REGISTERED', issuedAt: { gte: from } },
        include: purchaseInclude,
      }),
    ]);
    return buildDashboardSummary({
      activeSuppliers,
      dataSource: 'DATABASE',
      now,
      purchases: purchases.map(toDashboardPurchase),
    });
  }

  async getProcurementReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementReport> {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        organizationId,
        status: filters.status,
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
      },
      include: purchaseInclude,
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return buildProcurementReport({
      dataSource: 'DATABASE',
      filters,
      purchases: purchases.map(toReportPurchase),
    });
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

  private async validatePurchaseCenters(
    organizationId: string,
    supplier: SupplierRecord,
    input: CreatePurchaseInput,
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
    const count = await this.prisma.costCenter.count({
      where: { organizationId, id: { in: [...ids] }, active: true },
    });
    if (count !== ids.size) {
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
    defaultCostCenterId: supplier.defaultCostCenterId,
    defaultCostCenterName: supplier.defaultCostCenter?.name ?? null,
    email: supplier.email,
    phone: supplier.phone,
    status: supplier.status,
    notes: supplier.notes,
    priceCount: supplier._count.prices,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
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
    number: purchase.number,
    invoiceNumber: purchase.invoiceNumber,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
    issuedAt: toIsoDate(purchase.issuedAt) as string,
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
  };
}

function toDashboardPurchase(purchase: PurchaseRecord) {
  return {
    id: purchase.number,
    supplier: purchase.supplier.tradeName ?? purchase.supplier.legalName,
    issuedAt: purchase.issuedAt,
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

function toReportPurchase(purchase: PurchaseRecord) {
  return {
    id: purchase.id,
    number: purchase.number,
    invoiceNumber: purchase.invoiceNumber,
    issuedAt: toIsoDate(purchase.issuedAt) as string,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplier.tradeName ?? purchase.supplier.legalName,
    category: purchase.category,
    source: parsePurchaseSource(purchase.source),
    status: purchase.status,
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

function calculatePurchase(input: CreatePurchaseInput, supplierCenterId: string | null) {
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

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
