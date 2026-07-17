import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type {
  AttachPurchaseInvoiceInput,
  ChangePurchaseStatusInput,
  CostCenter,
  CreateCostCenterInput,
  CreateSupplierInput,
  CreateSupplierPriceInput,
  DashboardFilters,
  DashboardSummary,
  ImportSupplierPricesInput,
  PurchaseImportInput,
  PurchaseImportResult,
  PurchaseDetail,
  PurchaseSource,
  PurchaseStatus,
  PurchaseSummary,
  ProcurementDetailedReport,
  ProcurementReport,
  ProcurementReportFilters,
  Supplier,
  SupplierPrice,
  SupplierPriceImportResult,
  UpdateCostCenterInput,
  UpdatePurchaseInput,
  UpdateSupplierInput,
  UpdateSupplierPriceInput,
} from '@compras/contracts';

import { EXAMPLE_COMPANY_ID, HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { buildProcurementReport } from '../reports/procurement-report.builder.js';
import { buildDashboardSummary } from './dashboard-summary.builder.js';
import {
  ProcurementRepository,
  type CostCenterFilters,
  type PersistPurchaseInput,
  type PurchaseFilters,
  type SupplierFilters,
  type SupplierPriceFilters,
} from './procurement.repository.js';

type StoredCostCenter = CostCenter & { organizationId: string };
type StoredSupplier = Omit<Supplier, 'defaultCostCenterName' | 'priceCount'> & {
  organizationId: string;
};
type StoredPrice = Omit<SupplierPrice, 'savingsPercentage' | 'supplierName'> & {
  normalizedName: string;
  organizationId: string;
};
type StoredAllocation = { amount: number; costCenterId: string; percentage: number };
type StoredInstallment = {
  amount: number;
  dueDate: string;
  paidAt: string | null;
  sequence: number;
};
type StoredPurchaseItem = {
  allocations: StoredAllocation[];
  costCenterId: string | null;
  description: string;
  id: string;
  negotiatedPrice: number | null;
  quantity: number;
  total: number;
  unit: string | null;
  unitPrice: number;
};
type StoredPurchase = {
  category: string | null;
  createdAt: string;
  id: string;
  issuedAt: string | null;
  items: StoredPurchaseItem[];
  installments: StoredInstallment[];
  negotiatedSavings: number;
  notes: string | null;
  number: string;
  invoiceNumber: string | null;
  operationNature: string | null;
  organizationId: string;
  paymentMethod: string | null;
  source: PurchaseSource;
  sourceReference: string | null;
  status: PurchaseStatus;
  supplierId: string;
  total: number;
  updatedAt: string;
};

const INITIAL_DATE = '2026-07-01T12:00:00.000Z';

const centerIds = {
  admin: '41000000-0000-4000-8000-000000000003',
  assist: '41000000-0000-4000-8000-000000000001',
  lab: '41000000-0000-4000-8000-000000000002',
  operations: '42000000-0000-4000-8000-000000000001',
  technology: '41000000-0000-4000-8000-000000000004',
};

const supplierIds = {
  corporate: '51000000-0000-4000-8000-000000000003',
  demo: '52000000-0000-4000-8000-000000000001',
  laboratory: '51000000-0000-4000-8000-000000000002',
  medical: '51000000-0000-4000-8000-000000000001',
  services: '51000000-0000-4000-8000-000000000004',
};

export class DemoProcurementRepository extends ProcurementRepository {
  private readonly costCenters: StoredCostCenter[] = seedCostCenters();
  private readonly suppliers: StoredSupplier[] = seedSuppliers();
  private readonly prices: StoredPrice[] = seedPrices();
  private readonly purchases: StoredPurchase[] = seedPurchases();

  async listCostCenters(
    organizationId: string,
    filters: CostCenterFilters = {},
  ): Promise<CostCenter[]> {
    const search = normalizeSearch(filters.search ?? '');
    return this.costCenters
      .filter((center) => center.organizationId === organizationId)
      .filter((center) => filters.includeInactive || center.active)
      .filter((center) => !search || normalizeSearch(`${center.code} ${center.name}`).includes(search))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
      .map(({ organizationId: _organizationId, ...center }) => ({ ...center }));
  }

  async findCostCenter(organizationId: string, id: string): Promise<CostCenter | null> {
    const center = this.costCenters.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!center) {
      return null;
    }
    const { organizationId: _organizationId, ...result } = center;
    return { ...result };
  }

  async createCostCenter(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateCostCenterInput,
  ): Promise<CostCenter> {
    this.assertUniqueCenterCode(organizationId, input.code);
    const now = new Date().toISOString();
    const center: StoredCostCenter = {
      id: randomUUID(),
      organizationId,
      code: input.code,
      name: input.name,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.costCenters.push(center);
    const { organizationId: _organizationId, ...result } = center;
    return { ...result };
  }

  async updateCostCenter(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateCostCenterInput,
  ): Promise<CostCenter> {
    const center = this.costCenters.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!center) {
      throw new NotFoundException('Centro de custo nao encontrado.');
    }
    if (input.code && input.code !== center.code) {
      this.assertUniqueCenterCode(organizationId, input.code, id);
    }
    Object.assign(center, input, { updatedAt: new Date().toISOString() });
    const { organizationId: _organizationId, ...result } = center;
    return { ...result };
  }

  async listSuppliers(
    organizationId: string,
    filters: SupplierFilters = {},
  ): Promise<Supplier[]> {
    const search = normalizeSearch(filters.search ?? '');
    return this.suppliers
      .filter((supplier) => supplier.organizationId === organizationId)
      .filter((supplier) => !filters.status || supplier.status === filters.status)
      .filter((supplier) => {
        const searchable = `${supplier.legalName} ${supplier.tradeName ?? ''} ${supplier.document ?? ''} ${supplier.category ?? ''}`;
        return !search || normalizeSearch(searchable).includes(search);
      })
      .sort((left, right) => left.legalName.localeCompare(right.legalName, 'pt-BR'))
      .map((supplier) => this.toSupplier(supplier));
  }

  async findSupplier(organizationId: string, id: string): Promise<Supplier | null> {
    const supplier = this.suppliers.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    return supplier ? this.toSupplier(supplier) : null;
  }

  async createSupplier(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierInput,
  ): Promise<Supplier> {
    this.assertSupplierDocument(organizationId, input.document);
    this.assertCostCenterReference(organizationId, input.defaultCostCenterId);
    const now = new Date().toISOString();
    const supplier: StoredSupplier = {
      id: randomUUID(),
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
      status: 'ACTIVE',
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    this.suppliers.push(supplier);
    return this.toSupplier(supplier);
  }

  async updateSupplier(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierInput,
  ): Promise<Supplier> {
    const supplier = this.suppliers.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!supplier) {
      throw new NotFoundException('Fornecedor nao encontrado.');
    }
    if (input.document !== undefined && input.document !== supplier.document) {
      this.assertSupplierDocument(organizationId, input.document, id);
    }
    if (input.defaultCostCenterId !== undefined) {
      this.assertCostCenterReference(organizationId, input.defaultCostCenterId);
    }
    Object.assign(supplier, input, { updatedAt: new Date().toISOString() });
    return this.toSupplier(supplier);
  }

  async listSupplierPrices(
    organizationId: string,
    filters: SupplierPriceFilters = {},
  ): Promise<SupplierPrice[]> {
    const search = normalizeSearch(filters.search ?? '');
    return this.prices
      .filter((price) => price.organizationId === organizationId)
      .filter((price) => !filters.supplierId || price.supplierId === filters.supplierId)
      .map((price) => this.withEffectivePriceStatus(price))
      .filter((price) => !filters.status || price.status === filters.status)
      .filter((price) => {
        const searchable = `${price.itemCode ?? ''} ${price.description} ${this.supplierName(price.supplierId)}`;
        return !search || normalizeSearch(searchable).includes(search);
      })
      .sort((left, right) => left.description.localeCompare(right.description, 'pt-BR'))
      .map((price) => this.toSupplierPrice(price));
  }

  async createSupplierPrice(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierPriceInput,
  ): Promise<SupplierPrice> {
    this.assertSupplierReference(organizationId, input.supplierId);
    this.assertPriceValidity(input.validFrom, input.validUntil);
    const existing = this.findMatchingPrice(organizationId, input.supplierId, input.itemCode, input.description, input.unit);
    if (existing) {
      throw new ConflictException('Ja existe um preco para este item e fornecedor.');
    }
    const price = this.createStoredPrice(organizationId, input.supplierId, input);
    this.prices.push(price);
    return this.toSupplierPrice(price);
  }

  async updateSupplierPrice(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierPriceInput,
  ): Promise<SupplierPrice> {
    const price = this.prices.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!price) {
      throw new NotFoundException('Preco negociado nao encontrado.');
    }
    const validFrom = input.validFrom === undefined ? price.validFrom : input.validFrom;
    const validUntil = input.validUntil === undefined ? price.validUntil : input.validUntil;
    this.assertPriceValidity(validFrom, validUntil);
    Object.assign(price, input, {
      normalizedName: input.description ? normalizeSearch(input.description) : price.normalizedName,
      updatedAt: new Date().toISOString(),
    });
    return this.toSupplierPrice(this.withEffectivePriceStatus(price));
  }

  async importSupplierPrices(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: ImportSupplierPricesInput,
  ): Promise<SupplierPriceImportResult> {
    this.assertSupplierReference(organizationId, input.supplierId);
    let created = 0;
    let updated = 0;
    for (const item of input.items) {
      const existing = this.findMatchingPrice(
        organizationId,
        input.supplierId,
        item.itemCode,
        item.description,
        item.unit,
      );
      if (existing) {
        Object.assign(existing, item, {
          normalizedName: normalizeSearch(item.description),
          source: 'CSV' as const,
          status: 'ACTIVE' as const,
          updatedAt: new Date().toISOString(),
        });
        updated += 1;
      } else {
        this.prices.push(
          this.createStoredPrice(organizationId, input.supplierId, {
            ...item,
            supplierId: input.supplierId,
            source: 'CSV',
          }),
        );
        created += 1;
      }
    }
    return { total: input.items.length, created, updated };
  }

  async listPurchases(
    organizationId: string,
    filters: PurchaseFilters = {},
  ): Promise<PurchaseSummary[]> {
    const search = normalizeSearch(filters.search ?? '');
    return this.purchases
      .filter((purchase) => purchase.organizationId === organizationId)
      .filter((purchase) => !filters.status || purchase.status === filters.status)
      .filter(
        (purchase) =>
          !filters.dateFrom || (purchase.issuedAt !== null && purchase.issuedAt >= filters.dateFrom),
      )
      .filter(
        (purchase) =>
          !filters.dateTo || (purchase.issuedAt !== null && purchase.issuedAt <= filters.dateTo),
      )
      .filter((purchase) => {
        const searchable = `${purchase.number} ${purchase.invoiceNumber ?? ''} ${purchase.sourceReference ?? ''} ${this.supplierName(purchase.supplierId)} ${purchase.category ?? ''}`;
        return !search || normalizeSearch(searchable).includes(search);
      })
      .sort(
        (left, right) =>
          (right.issuedAt ?? '').localeCompare(left.issuedAt ?? '') ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .map((purchase) => this.toPurchaseSummary(purchase));
  }

  async getPurchase(organizationId: string, id: string): Promise<PurchaseDetail> {
    return this.toPurchaseDetail(this.requireStoredPurchase(organizationId, id));
  }

  async createPurchase(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: PersistPurchaseInput,
  ): Promise<PurchaseSummary> {
    const purchase = this.createStoredPurchase(organizationId, input);
    this.purchases.push(purchase);
    return this.toPurchaseSummary(purchase);
  }

  async updatePurchase(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdatePurchaseInput,
  ): Promise<PurchaseDetail> {
    const purchase = this.requireStoredPurchase(organizationId, id);
    if (purchase.status === 'CANCELLED') {
      throw new BadRequestException('Reative a compra antes de altera-la.');
    }
    if (purchase.updatedAt !== input.expectedUpdatedAt) {
      throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
    }
    const replacement = this.createStoredPurchase(
      organizationId,
      {
        ...input,
        source: purchase.source,
        sourceReference: purchase.sourceReference,
      },
      {
        allowedInactiveCenterIds: storedPurchaseCenterIds(purchase),
        allowedInactiveSupplierId: purchase.supplierId,
        ignoredPurchaseId: id,
      },
    );
    preservePaidInstallments(purchase.installments, replacement.installments);
    Object.assign(replacement, {
      createdAt: purchase.createdAt,
      id: purchase.id,
      status: purchase.status,
      updatedAt: nextTimestamp(purchase.updatedAt),
    });
    Object.assign(purchase, replacement);
    return this.toPurchaseDetail(purchase);
  }

  async changePurchaseStatus(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseStatusInput,
  ): Promise<PurchaseSummary> {
    const purchase = this.requireStoredPurchase(organizationId, id);
    if (purchase.status === input.status) {
      return this.toPurchaseSummary(purchase);
    }
    if (purchase.updatedAt !== input.expectedUpdatedAt) {
      throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
    }
    purchase.status = input.status;
    purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    return this.toPurchaseSummary(purchase);
  }

  async importPurchases(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PurchaseImportInput,
  ): Promise<PurchaseImportResult> {
    let created = 0;
    let duplicated = 0;
    for (const purchase of input.purchases) {
      if (this.isDuplicatePurchase(organizationId, purchase)) {
        duplicated += 1;
        continue;
      }
      await this.createPurchase(actor, organizationId, purchase);
      created += 1;
    }
    return { total: input.purchases.length, created, duplicated };
  }

  async attachPurchaseInvoice(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: AttachPurchaseInvoiceInput,
  ): Promise<PurchaseSummary> {
    const purchase = this.purchases.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === purchaseId,
    );
    if (!purchase) {
      throw new NotFoundException('Compra nao encontrada.');
    }
    const duplicate = this.purchases.some(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.id !== purchaseId &&
        candidate.supplierId === purchase.supplierId &&
        candidate.invoiceNumber === input.invoiceNumber,
    );
    if (duplicate) {
      throw new ConflictException('Esta nota fiscal ja esta vinculada a outra compra.');
    }
    purchase.invoiceNumber = input.invoiceNumber;
    purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    return this.toPurchaseSummary(purchase);
  }

  async getDashboardSummary(
    organizationId: string,
    filters: DashboardFilters,
  ): Promise<DashboardSummary> {
    const purchases = this.purchases
      .filter(
        (purchase) =>
          purchase.organizationId === organizationId && purchase.status === 'REGISTERED',
      )
      .filter(
        (purchase) =>
          !filters.dateFrom || (purchase.issuedAt !== null && purchase.issuedAt >= filters.dateFrom),
      )
      .filter(
        (purchase) =>
          !filters.dateTo || (purchase.issuedAt !== null && purchase.issuedAt <= filters.dateTo),
      )
      .filter(
        (purchase) =>
          filters.dateFrom !== undefined ||
          filters.dateTo !== undefined ||
          filters.includeUndated ||
          purchase.issuedAt !== null,
      )
      .filter((purchase) => !filters.supplierId || purchase.supplierId === filters.supplierId)
      .filter(
        (purchase) =>
          !filters.category ||
          normalizeSearch(purchase.category ?? '') === normalizeSearch(filters.category),
      )
      .filter(
        (purchase) =>
          !filters.costCenterId ||
          purchase.items.some(
            (item) =>
              item.costCenterId === filters.costCenterId ||
              item.allocations.some(
                (allocation) => allocation.costCenterId === filters.costCenterId,
              ),
          ),
      )
      .map((purchase) => ({
        id: purchase.number,
        supplier: this.supplierName(purchase.supplierId),
        issuedAt: purchase.issuedAt
          ? new Date(`${purchase.issuedAt}T00:00:00.000Z`)
          : null,
        createdAt: new Date(purchase.createdAt),
        total: purchase.total,
        negotiatedSavings: purchase.negotiatedSavings,
        category: purchase.category,
        items: purchase.items.map((item) => ({
          total: item.total,
          costCenter: item.costCenterId ? this.costCenterName(item.costCenterId) : null,
          allocations: item.allocations.map((allocation) => ({
            costCenter: this.costCenterName(allocation.costCenterId),
            amount: allocation.amount,
          })),
        })),
      }));
    const activeSuppliers = this.suppliers.filter(
      (supplier) => supplier.organizationId === organizationId && supplier.status === 'ACTIVE',
    ).length;
    return buildDashboardSummary({ activeSuppliers, dataSource: 'DEMO', filters, purchases });
  }

  async getProcurementReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementReport> {
    const purchases = this.purchases
      .filter((purchase) => purchase.organizationId === organizationId)
      .filter((purchase) => purchase.status === filters.status)
      .filter(
        (purchase) =>
          !filters.dateFrom || (purchase.issuedAt !== null && purchase.issuedAt >= filters.dateFrom),
      )
      .filter(
        (purchase) =>
          !filters.dateTo || (purchase.issuedAt !== null && purchase.issuedAt <= filters.dateTo),
      )
      .filter((purchase) => !filters.supplierId || purchase.supplierId === filters.supplierId)
      .filter(
        (purchase) =>
          !filters.category ||
          normalizeSearch(purchase.category ?? '') === normalizeSearch(filters.category),
      )
      .filter(
        (purchase) =>
          !filters.costCenterId ||
          purchase.items.some(
            (item) =>
              item.costCenterId === filters.costCenterId ||
              item.allocations.some(
                (allocation) => allocation.costCenterId === filters.costCenterId,
              ),
          ),
      )
      .map((purchase) => ({
        id: purchase.id,
        number: purchase.number,
        invoiceNumber: purchase.invoiceNumber,
        issuedAt: purchase.issuedAt,
        supplierId: purchase.supplierId,
        supplierName: this.supplierName(purchase.supplierId),
        category: purchase.category,
        source: purchase.source,
        status: purchase.status,
        itemCount: purchase.items.length,
        total: purchase.total,
        negotiatedSavings: purchase.negotiatedSavings,
        departmentAllocations: purchase.items.flatMap((item) =>
          item.allocations.length
            ? item.allocations.map((allocation) => ({
                departmentId: allocation.costCenterId,
                departmentName: this.costCenterName(allocation.costCenterId),
                amount: allocation.amount,
              }))
            : [
                {
                  departmentId: item.costCenterId ?? 'unallocated',
                  departmentName: item.costCenterId
                    ? this.costCenterName(item.costCenterId)
                    : 'Sem centro de custo',
                  amount: item.total,
                },
              ],
        ),
      }));

    return buildProcurementReport({ dataSource: 'DEMO', filters, purchases });
  }

  async getProcurementDetailedReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementDetailedReport> {
    const summary = await this.getProcurementReport(organizationId, filters);
    const purchases = this.purchases
      .filter((purchase) => summary.purchases.some((entry) => entry.id === purchase.id))
      .map((purchase) => {
        const supplier = this.suppliers.find(
          (candidate) =>
            candidate.organizationId === organizationId && candidate.id === purchase.supplierId,
        );
        if (!supplier) throw new NotFoundException('Fornecedor nao encontrado.');
        return {
          id: purchase.id,
          number: purchase.number,
          invoiceNumber: purchase.invoiceNumber,
          issuedAt: purchase.issuedAt,
          status: purchase.status,
          category: purchase.category,
          operationNature: purchase.operationNature,
          paymentMethod: purchase.paymentMethod,
          notes: purchase.notes,
          source: purchase.source,
          sourceReference: purchase.sourceReference,
          total: purchase.total,
          negotiatedSavings: purchase.negotiatedSavings,
          createdAt: purchase.createdAt,
          supplier: {
            id: supplier.id,
            legalName: supplier.legalName,
            tradeName: supplier.tradeName,
            document: supplier.document,
            category: supplier.category,
            operationNature: supplier.operationNature,
            paymentMethod: supplier.paymentMethod,
            email: supplier.email,
            phone: supplier.phone,
            defaultCostCenter: supplier.defaultCostCenterId
              ? this.costCenterDetails(supplier.defaultCostCenterId)
              : null,
          },
          items: purchase.items.map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            negotiatedPrice: item.negotiatedPrice,
            total: item.total,
            negotiatedSavings: roundMoney(
              Math.max(0, item.unitPrice - (item.negotiatedPrice ?? item.unitPrice)) *
                item.quantity,
            ),
            costCenter: item.costCenterId ? this.costCenterDetails(item.costCenterId) : null,
            allocations: item.allocations.map((allocation) => ({
              costCenter: this.costCenterDetails(allocation.costCenterId),
              percentage: allocation.percentage,
              amount: allocation.amount,
            })),
          })),
          installments: purchase.installments.map((installment) => ({ ...installment })),
          invoices: [],
        };
      })
      .sort(
        (left, right) =>
          (right.issuedAt ?? '').localeCompare(left.issuedAt ?? '') ||
          right.number.localeCompare(left.number),
      );
    return { summary, purchases };
  }

  private createStoredPurchase(
    organizationId: string,
    input: PersistPurchaseInput,
    options: {
      allowedInactiveCenterIds?: ReadonlySet<string>;
      allowedInactiveSupplierId?: string;
      ignoredPurchaseId?: string;
    } = {},
  ): StoredPurchase {
    const supplier = this.assertSupplierReference(
      organizationId,
      input.supplierId,
      options.allowedInactiveSupplierId === input.supplierId,
    );
    if (this.isDuplicatePurchase(organizationId, input, options.ignoredPurchaseId)) {
      throw new ConflictException('Esta compra ja foi registrada.');
    }
    const items = input.items.map((item) => {
      const finalUnitPrice = item.negotiatedPrice ?? item.unitPrice;
      const total = roundMoney(item.quantity * finalUnitPrice);
      const fallbackCenter = item.costCenterId ?? supplier.defaultCostCenterId;
      if (fallbackCenter) {
        this.assertCostCenterReference(
          organizationId,
          fallbackCenter,
          options.allowedInactiveCenterIds?.has(fallbackCenter),
        );
      }
      for (const allocation of item.allocations) {
        this.assertCostCenterReference(
          organizationId,
          allocation.costCenterId,
          options.allowedInactiveCenterIds?.has(allocation.costCenterId),
        );
      }
      return {
        id: randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        negotiatedPrice: item.negotiatedPrice,
        total,
        costCenterId: item.allocations.length ? null : fallbackCenter,
        allocations: allocateAmounts(total, item.allocations),
      };
    });
    const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    const negotiatedSavings = roundMoney(
      input.items.reduce(
        (sum, item) =>
          sum + Math.max(0, item.unitPrice - (item.negotiatedPrice ?? item.unitPrice)) * item.quantity,
        0,
      ),
    );
    const installmentTotal = roundMoney(
      input.installments.reduce((sum, installment) => sum + installment.amount, 0),
    );
    if (input.installments.length && Math.abs(total - installmentTotal) > 0.01) {
      throw new BadRequestException('A soma das parcelas deve ser igual ao total da compra.');
    }
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      organizationId,
      number: input.number,
      invoiceNumber: input.invoiceNumber ?? null,
      supplierId: input.supplierId,
      issuedAt: input.issuedAt,
      status: 'REGISTERED',
      category: input.category ?? supplier.category,
      operationNature: input.operationNature ?? supplier.operationNature,
      paymentMethod: input.paymentMethod ?? supplier.paymentMethod,
      total,
      negotiatedSavings,
      source: input.source,
      sourceReference: input.sourceReference,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
      items,
      installments: input.installments.map((installment, index) => ({
        sequence: index + 1,
        dueDate: installment.dueDate,
        amount: installment.amount,
        paidAt: null,
      })),
    };
  }

  private isDuplicatePurchase(
    organizationId: string,
    input: PersistPurchaseInput,
    ignoredPurchaseId?: string,
  ): boolean {
    return this.purchases.some(
      (purchase) =>
        purchase.organizationId === organizationId &&
        purchase.id !== ignoredPurchaseId &&
        (purchase.number === input.number ||
          (input.invoiceNumber &&
            purchase.supplierId === input.supplierId &&
            purchase.invoiceNumber === input.invoiceNumber) ||
          (input.sourceReference &&
            purchase.source === input.source &&
            purchase.sourceReference === input.sourceReference)),
    );
  }

  private createStoredPrice(
    organizationId: string,
    supplierId: string,
    input: Omit<CreateSupplierPriceInput, 'supplierId'> | CreateSupplierPriceInput,
  ): StoredPrice {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      organizationId,
      supplierId,
      itemCode: input.itemCode,
      description: input.description,
      normalizedName: normalizeSearch(input.description),
      unit: input.unit,
      initialPrice: input.initialPrice,
      negotiatedPrice: input.negotiatedPrice,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      status: 'ACTIVE',
      source: input.source,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
  }

  private findMatchingPrice(
    organizationId: string,
    supplierId: string,
    itemCode: string | null,
    description: string,
    unit: string | null,
  ): StoredPrice | undefined {
    return this.prices.find(
      (price) =>
        price.organizationId === organizationId &&
        price.supplierId === supplierId &&
        (itemCode
          ? price.itemCode?.toLowerCase() === itemCode.toLowerCase()
          : !price.itemCode &&
            price.normalizedName === normalizeSearch(description) &&
            (price.unit ?? '').toLowerCase() === (unit ?? '').toLowerCase()),
    );
  }

  private toSupplier(supplier: StoredSupplier): Supplier {
    const { organizationId: _organizationId, ...result } = supplier;
    return {
      ...result,
      defaultCostCenterName: result.defaultCostCenterId
        ? this.costCenterName(result.defaultCostCenterId)
        : null,
      priceCount: this.prices.filter((price) => price.supplierId === result.id).length,
    };
  }

  private toSupplierPrice(price: StoredPrice): SupplierPrice {
    const {
      normalizedName: _normalizedName,
      organizationId: _organizationId,
      ...result
    } = price;
    return {
      ...result,
      supplierName: this.supplierName(result.supplierId),
      savingsPercentage:
        result.initialPrice && result.initialPrice > 0
          ? Math.round(((result.initialPrice - result.negotiatedPrice) / result.initialPrice) * 1_000) / 10
          : null,
    };
  }

  private toPurchaseSummary(purchase: StoredPurchase): PurchaseSummary {
    return {
      id: purchase.id,
      number: purchase.number,
      invoiceNumber: purchase.invoiceNumber,
      supplierId: purchase.supplierId,
      supplierName: this.supplierName(purchase.supplierId),
      issuedAt: purchase.issuedAt,
      status: purchase.status,
      category: purchase.category,
      paymentMethod: purchase.paymentMethod,
      total: purchase.total,
      negotiatedSavings: purchase.negotiatedSavings,
      departments: [
        ...new Set(
          purchase.items.flatMap((item) =>
            item.allocations.length
              ? item.allocations.map((allocation) => this.costCenterName(allocation.costCenterId))
              : item.costCenterId
                ? [this.costCenterName(item.costCenterId)]
                : [],
          ),
        ),
      ],
      itemCount: purchase.items.length,
      source: purchase.source,
      sourceReference: purchase.sourceReference,
      createdAt: purchase.createdAt,
    };
  }

  private toPurchaseDetail(purchase: StoredPurchase): PurchaseDetail {
    return {
      ...this.toPurchaseSummary(purchase),
      operationNature: purchase.operationNature,
      notes: purchase.notes,
      items: purchase.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        negotiatedPrice: item.negotiatedPrice,
        total: item.total,
        costCenterId: item.costCenterId,
        costCenterName: item.costCenterId ? this.costCenterName(item.costCenterId) : null,
        allocations: item.allocations.map((allocation) => ({
          costCenterId: allocation.costCenterId,
          costCenterName: this.costCenterName(allocation.costCenterId),
          percentage: allocation.percentage,
          amount: allocation.amount,
        })),
      })),
      installments: purchase.installments.map((installment) => ({ ...installment })),
      updatedAt: purchase.updatedAt,
    };
  }

  private withEffectivePriceStatus(price: StoredPrice): StoredPrice {
    if (
      price.status === 'ACTIVE' &&
      price.validUntil &&
      price.validUntil < new Date().toISOString().slice(0, 10)
    ) {
      return { ...price, status: 'EXPIRED' };
    }
    return price;
  }

  private assertUniqueCenterCode(organizationId: string, code: string, ignoredId?: string) {
    if (
      this.costCenters.some(
        (center) =>
          center.organizationId === organizationId &&
          center.id !== ignoredId &&
          center.code.toLowerCase() === code.toLowerCase(),
      )
    ) {
      throw new ConflictException('Ja existe um centro de custo com este codigo.');
    }
  }

  private assertSupplierDocument(
    organizationId: string,
    document: string | null,
    ignoredId?: string,
  ) {
    if (
      document &&
      this.suppliers.some(
        (supplier) =>
          supplier.organizationId === organizationId &&
          supplier.id !== ignoredId &&
          supplier.document === document,
      )
    ) {
      throw new ConflictException('Ja existe um fornecedor com este CNPJ.');
    }
  }

  private assertCostCenterReference(
    organizationId: string,
    costCenterId: string | null,
    allowInactive = false,
  ): StoredCostCenter | null {
    if (!costCenterId) {
      return null;
    }
    const center = this.costCenters.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.id === costCenterId &&
        (allowInactive || candidate.active),
    );
    if (!center) {
      throw new BadRequestException('Centro de custo invalido ou inativo.');
    }
    return center;
  }

  private assertSupplierReference(
    organizationId: string,
    supplierId: string,
    allowInactive = false,
  ): StoredSupplier {
    const supplier = this.suppliers.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.id === supplierId &&
        (allowInactive || candidate.status === 'ACTIVE'),
    );
    if (!supplier) {
      throw new BadRequestException('Fornecedor invalido ou inativo.');
    }
    return supplier;
  }

  private requireStoredPurchase(organizationId: string, id: string): StoredPurchase {
    const purchase = this.purchases.find(
      (candidate) => candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!purchase) {
      throw new NotFoundException('Compra nao encontrada.');
    }
    return purchase;
  }

  private assertPriceValidity(validFrom: string | null, validUntil: string | null) {
    if (validFrom && validUntil && validUntil < validFrom) {
      throw new BadRequestException('A validade final deve ser igual ou posterior a inicial.');
    }
  }

  private supplierName(id: string): string {
    return this.suppliers.find((supplier) => supplier.id === id)?.tradeName ??
      this.suppliers.find((supplier) => supplier.id === id)?.legalName ??
      'Fornecedor nao encontrado';
  }

  private costCenterName(id: string): string {
    return this.costCenters.find((center) => center.id === id)?.name ?? 'Nao classificado';
  }

  private costCenterDetails(id: string) {
    const center = this.costCenters.find((candidate) => candidate.id === id);
    if (!center) throw new NotFoundException('Centro de custo nao encontrado.');
    return { id: center.id, code: center.code, name: center.name };
  }
}

function preservePaidInstallments(
  currentInstallments: StoredInstallment[],
  requestedInstallments: StoredInstallment[],
) {
  for (const current of currentInstallments) {
    if (!current.paidAt) continue;
    const requested = requestedInstallments[current.sequence - 1];
    if (
      !requested ||
      requested.dueDate !== current.dueDate ||
      Math.abs(requested.amount - current.amount) > 0.01
    ) {
      throw new BadRequestException(
        'Parcelas pagas nao podem ser alteradas, reordenadas ou removidas.',
      );
    }
    requested.paidAt = current.paidAt;
  }
}

function storedPurchaseCenterIds(purchase: StoredPurchase): Set<string> {
  return new Set(
    purchase.items.flatMap((purchaseItem) => [
      ...(purchaseItem.costCenterId ? [purchaseItem.costCenterId] : []),
      ...purchaseItem.allocations.map((allocation) => allocation.costCenterId),
    ]),
  );
}

function allocateAmounts(
  total: number,
  allocations: Array<{ costCenterId: string; percentage: number }>,
): StoredAllocation[] {
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

function nextTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function seedCostCenters(): StoredCostCenter[] {
  return [
    center(HUMAN_CLINIC_ID, centerIds.assist, 'ASSIST', 'Assistencial'),
    center(HUMAN_CLINIC_ID, centerIds.lab, 'LAB', 'Laboratorio'),
    center(HUMAN_CLINIC_ID, centerIds.admin, 'ADM', 'Administrativo'),
    center(HUMAN_CLINIC_ID, centerIds.technology, 'TI', 'Tecnologia'),
    center(EXAMPLE_COMPANY_ID, centerIds.operations, 'OP', 'Operacoes'),
  ];
}

function center(organizationId: string, id: string, code: string, name: string): StoredCostCenter {
  return { id, organizationId, code, name, active: true, createdAt: INITIAL_DATE, updatedAt: INITIAL_DATE };
}

function seedSuppliers(): StoredSupplier[] {
  return [
    supplier(HUMAN_CLINIC_ID, supplierIds.medical, 'Distribuidora Medica Central', 'Medicamentos', centerIds.assist),
    supplier(HUMAN_CLINIC_ID, supplierIds.laboratory, 'Laboratorios Integrados', 'Materiais', centerIds.lab),
    supplier(HUMAN_CLINIC_ID, supplierIds.corporate, 'Suprimentos Corporativos', 'Administrativo', centerIds.admin),
    supplier(HUMAN_CLINIC_ID, supplierIds.services, 'Servicos Especializados', 'Servicos', centerIds.technology),
    supplier(EXAMPLE_COMPANY_ID, supplierIds.demo, 'Fornecedor demonstrativo', 'Insumos', centerIds.operations),
  ];
}

function supplier(
  organizationId: string,
  id: string,
  legalName: string,
  category: string,
  defaultCostCenterId: string,
): StoredSupplier {
  return {
    id,
    organizationId,
    legalName,
    tradeName: null,
    document: null,
    category,
    operationNature: 'Compra de materiais e servicos',
    paymentMethod: 'Boleto',
    defaultCostCenterId,
    email: null,
    phone: null,
    status: 'ACTIVE',
    notes: null,
    createdAt: INITIAL_DATE,
    updatedAt: INITIAL_DATE,
  };
}

function seedPrices(): StoredPrice[] {
  return [
    price('61000000-0000-4000-8000-000000000001', HUMAN_CLINIC_ID, supplierIds.medical, 'MED-001', 'Medicamento hospitalar', 'CX', 128, 112),
    price('61000000-0000-4000-8000-000000000002', HUMAN_CLINIC_ID, supplierIds.laboratory, 'LAB-001', 'Kit de coleta', 'UN', 42, 36.5),
    price('61000000-0000-4000-8000-000000000003', EXAMPLE_COMPANY_ID, supplierIds.demo, 'INS-001', 'Insumo demonstrativo', 'UN', 20, 17.5),
  ];
}

function price(
  id: string,
  organizationId: string,
  supplierId: string,
  itemCode: string,
  description: string,
  unit: string,
  initialPrice: number,
  negotiatedPrice: number,
): StoredPrice {
  return {
    id,
    organizationId,
    supplierId,
    itemCode,
    description,
    normalizedName: normalizeSearch(description),
    unit,
    initialPrice,
    negotiatedPrice,
    validFrom: '2026-01-01',
    validUntil: '2026-12-31',
    status: 'ACTIVE',
    source: 'MANUAL',
    notes: null,
    createdAt: INITIAL_DATE,
    updatedAt: INITIAL_DATE,
  };
}

function seedPurchases(): StoredPurchase[] {
  return [
    seededPurchase('71000000-0000-4000-8000-000000000001', HUMAN_CLINIC_ID, 'PC-2026-0128', supplierIds.medical, '2026-07-12', 'Medicamentos', 68_440, 8_560, [
      item(68_440, null, [allocation(centerIds.assist, 73.056, 50_000), allocation(centerIds.lab, 26.944, 18_440)]),
    ]),
    seededPurchase('71000000-0000-4000-8000-000000000002', HUMAN_CLINIC_ID, 'PC-2026-0127', supplierIds.laboratory, '2026-07-11', 'Materiais', 52_180, 6_820, [
      item(52_180, null, [allocation(centerIds.assist, 57.493, 30_000), allocation(centerIds.admin, 42.507, 22_180)]),
    ]),
    seededPurchase('71000000-0000-4000-8000-000000000003', HUMAN_CLINIC_ID, 'PC-2026-0126', supplierIds.services, '2026-07-10', 'Servicos', 37_300, 4_700, [
      item(37_300, null, [allocation(centerIds.technology, 53.619, 20_000), allocation(centerIds.admin, 46.381, 17_300)]),
    ]),
    seededPurchase('71000000-0000-4000-8000-000000000004', HUMAN_CLINIC_ID, 'PC-2026-0125', supplierIds.corporate, '2026-07-08', 'Administrativo', 26_700.48, 1_358.72, [item(26_700.48, centerIds.admin, [])]),
    seededPurchase('71000000-0000-4000-8000-000000000005', HUMAN_CLINIC_ID, 'PC-2026-0110', supplierIds.medical, '2026-06-18', 'Medicamentos', 154_300, 18_770, [item(154_300, centerIds.assist, [])]),
    seededPurchase('72000000-0000-4000-8000-000000000001', EXAMPLE_COMPANY_ID, 'PC-2026-0031', supplierIds.demo, '2026-07-09', 'Insumos', 42_750, 5_620, [item(42_750, centerIds.operations, [])]),
  ];
}

function seededPurchase(
  id: string,
  organizationId: string,
  number: string,
  supplierId: string,
  issuedAt: string,
  category: string,
  total: number,
  negotiatedSavings: number,
  items: StoredPurchaseItem[],
): StoredPurchase {
  const timestamp = `${issuedAt}T12:00:00.000Z`;
  let assignedSavings = 0;
  const reconciledItems = items.map((purchaseItem, index) => {
    const itemSavings =
      index === items.length - 1
        ? roundMoney(negotiatedSavings - assignedSavings)
        : roundMoney(negotiatedSavings * (purchaseItem.total / total));
    assignedSavings = roundMoney(assignedSavings + itemSavings);
    return {
      ...purchaseItem,
      unitPrice: roundMoney((purchaseItem.total + itemSavings) / purchaseItem.quantity),
      negotiatedPrice: roundMoney(purchaseItem.total / purchaseItem.quantity),
    };
  });
  return {
    id,
    organizationId,
    number,
    invoiceNumber: null,
    supplierId,
    issuedAt,
    status: 'REGISTERED',
    category,
    operationNature: null,
    paymentMethod: 'Boleto',
    total,
    negotiatedSavings,
    source: 'MANUAL',
    sourceReference: null,
    notes: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    items: reconciledItems,
    installments: [],
  };
}

function item(
  total: number,
  costCenterId: string | null,
  allocations: StoredAllocation[],
): StoredPurchaseItem {
  return {
    id: randomUUID(),
    description: 'Item demonstrativo',
    quantity: 1,
    unit: 'UN',
    unitPrice: total,
    negotiatedPrice: total,
    total,
    costCenterId,
    allocations,
  };
}

function allocation(costCenterId: string, percentage: number, amount: number): StoredAllocation {
  return { costCenterId, percentage, amount };
}
