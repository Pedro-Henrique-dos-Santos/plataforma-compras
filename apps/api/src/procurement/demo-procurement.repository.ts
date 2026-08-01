import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
  PurchaseImportInput,
  PurchaseImportResult,
  PurchaseDetail,
  PurchaseSource,
  PurchaseStatus,
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

import {
  DEMO_USER_ID,
  EXAMPLE_COMPANY_ID,
  HUMAN_CLINIC_ID,
} from '../demo/demo.data.js';
import { currentBusinessIsoDate } from '../common/business-date.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { buildProcurementReport } from '../reports/procurement-report.builder.js';
import {
  buildDashboardSummary,
  previousDashboardPeriodFilters,
  type DashboardPurchase,
} from './dashboard-summary.builder.js';
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
  paymentChannel: 'PIX' | 'CARD_LINK' | 'BOLETO' | 'BANK_TRANSFER' | 'OTHER' | null;
  paymentReference: string | null;
  paymentNotes: string | null;
  sequence: number;
};
type StoredApprovalParticipant = {
  userId: string;
  name: string;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED';
  comment: string | null;
  decidedAt: string | null;
};
type StoredApprovalRequest = {
  requestId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  ruleName: string;
  requiredApprovals: number;
  amountSnapshot: number;
  submittedAt: string;
  resolvedAt: string | null;
  submittedById: string;
  participants: StoredApprovalParticipant[];
};
type StoredStageHistory = {
  id: string;
  fromStage: PurchaseWorkflowStage | null;
  toStage: PurchaseWorkflowStage;
  changedById: string;
  changedByName: string;
  reason: string | null;
  createdAt: string;
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
  workflowStage: PurchaseWorkflowStage;
  approvalRequests: StoredApprovalRequest[];
  stageHistory: StoredStageHistory[];
  supplierId: string;
  total: number;
  updatedAt: string;
};

const INITIAL_DATE = '2026-07-01T12:00:00.000Z';
const DEMO_BUYER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
  private readonly approvalRules: Array<ApprovalRule & { organizationId: string }> =
    seedApprovalRules();
  private readonly approvalSettings = new Map<string, ApprovalSettings>();

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
      pixKeyType: input.pixKeyType ?? null,
      pixKey: input.pixKey ?? null,
      paymentLink: input.paymentLink ?? null,
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
          !filters.workflowStage || purchase.workflowStage === filters.workflowStage,
      )
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
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PersistPurchaseInput,
  ): Promise<PurchaseSummary> {
    const purchase = this.createStoredPurchase(organizationId, input);
    purchase.stageHistory.push({
      id: randomUUID(),
      fromStage: null,
      toStage: purchase.workflowStage,
      changedById: actor.id,
      changedByName: actor.name,
      reason: 'Compra criada.',
      createdAt: purchase.createdAt,
    });
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
    if (!['REGISTRATION', 'REQUESTED'].includes(purchase.workflowStage)) {
      throw new BadRequestException(
        'Os dados da compra so podem ser alterados durante o cadastro ou a solicitacao.',
      );
    }
    if ((input.invoiceNumber ?? null) !== purchase.invoiceNumber) {
      throw new BadRequestException(
        'Vincule a nota fiscal pela automacao documental depois que o pedido for aprovado.',
      );
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
      workflowStage: purchase.workflowStage,
      approvalRequests: purchase.approvalRequests,
      stageHistory: purchase.stageHistory,
      updatedAt: nextTimestamp(purchase.updatedAt),
    });
    Object.assign(purchase, replacement);
    return this.toPurchaseDetail(purchase);
  }

  async changePurchaseStatus(
    actor: AuthenticatedIdentity,
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
    const previousStage = purchase.workflowStage;
    if (input.status === 'CANCELLED' && purchase.workflowStage === 'AWAITING_APPROVAL') {
      purchase.workflowStage = 'REQUESTED';
      for (const request of purchase.approvalRequests) {
        if (request.status === 'PENDING') {
          request.status = 'CANCELLED';
          request.resolvedAt = new Date().toISOString();
        }
      }
    }
    purchase.status =
      input.status === 'CANCELLED'
        ? 'CANCELLED'
        : demoLifecycleStatusForStage(purchase.workflowStage);
    purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    if (previousStage !== purchase.workflowStage) {
      purchase.stageHistory.push({
        id: randomUUID(),
        fromStage: previousStage,
        toStage: purchase.workflowStage,
        changedById: actor.id,
        changedByName: actor.name,
        reason: input.reason,
        createdAt: purchase.updatedAt,
      });
    }
    return this.toPurchaseSummary(purchase);
  }

  async changePurchaseWorkflowStage(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseWorkflowStageInput,
  ): Promise<PurchaseDetail> {
    const purchase = this.requireStoredPurchase(organizationId, id);
    if (purchase.status === 'CANCELLED') {
      throw new BadRequestException('Reative a compra antes de alterar o fluxo.');
    }
    if (purchase.updatedAt !== input.expectedUpdatedAt) {
      throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
    }
    if (purchase.workflowStage === input.stage) {
      return this.toPurchaseDetail(purchase);
    }
    assertDemoManualStageTransition(
      purchase.workflowStage,
      input.stage,
      input.reason ?? null,
      purchase.invoiceNumber !== null,
    );
    this.moveStoredPurchase(purchase, input.stage, actor, input.reason ?? null);
    return this.toPurchaseDetail(purchase);
  }

  async submitPurchaseForApproval(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    expectedUpdatedAt: string,
  ): Promise<PurchaseDetail> {
    const purchase = this.requireStoredPurchase(organizationId, id);
    if (
      purchase.status === 'CANCELLED' ||
      purchase.workflowStage !== 'REQUESTED'
    ) {
      throw new BadRequestException(
        'A compra precisa estar na etapa Solicitacao para ser enviada a aprovacao.',
      );
    }
    if (purchase.updatedAt !== expectedUpdatedAt) {
      throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
    }
    const rule = this.approvalRules
      .filter(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.active &&
          candidate.minimumAmount <= purchase.total,
      )
      .sort((left, right) => right.minimumAmount - left.minimumAmount)[0];
    if (!rule) {
      throw new BadRequestException(
        'Nenhuma regra de aprovacao ativa atende ao valor desta compra.',
      );
    }
    if (rule.approvers.length < rule.requiredApprovals) {
      throw new BadRequestException(
        'A regra nao possui aprovadores ativos suficientes para o quorum configurado.',
      );
    }
    const now = new Date().toISOString();
    purchase.approvalRequests.push({
      requestId: randomUUID(),
      status: 'PENDING',
      ruleName: rule.name,
      requiredApprovals: rule.requiredApprovals,
      amountSnapshot: purchase.total,
      submittedAt: now,
      resolvedAt: null,
      submittedById: actor.id,
      participants: rule.approvers.map((approver) => ({
        userId: approver.userId,
        name: approver.name,
        decision: 'PENDING',
        comment: null,
        decidedAt: null,
      })),
    });
    this.moveStoredPurchase(
      purchase,
      'AWAITING_APPROVAL',
      actor,
      `Enviado para ${rule.requiredApprovals} aprovacao(oes).`,
    );
    return this.toPurchaseDetail(purchase);
  }

  async recordApprovalDecision(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: RecordApprovalDecisionInput,
  ): Promise<PurchaseDetail> {
    const purchase = this.purchases.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.approvalRequests.some(
          (request) => request.requestId === input.requestId,
        ),
    );
    if (!purchase) {
      throw new NotFoundException('Aprovacao pendente nao encontrada para este usuario.');
    }
    const request = purchase.approvalRequests.find(
      (candidate) => candidate.requestId === input.requestId,
    );
    const participant = request?.participants.find(
      (candidate) => candidate.userId === actor.id,
    );
    if (!request || request.status !== 'PENDING' || !participant) {
      throw new NotFoundException('Aprovacao pendente nao encontrada para este usuario.');
    }
    if (participant.decision !== 'PENDING') {
      throw new ConflictException('Esta aprovacao ja foi respondida.');
    }
    const now = new Date().toISOString();
    participant.decision = input.decision;
    participant.comment = input.comment;
    participant.decidedAt = now;
    if (input.decision === 'REJECTED') {
      request.status = 'REJECTED';
      request.resolvedAt = now;
      this.moveStoredPurchase(purchase, 'REQUESTED', actor, input.comment);
    } else if (
      request.participants.filter((candidate) => candidate.decision === 'APPROVED')
        .length >= request.requiredApprovals
    ) {
      request.status = 'APPROVED';
      request.resolvedAt = now;
      this.moveStoredPurchase(
        purchase,
        'PURCHASE_ORDER',
        actor,
        `Quorum de ${request.requiredApprovals} aprovacao(oes) atingido.`,
      );
    } else {
      purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    }
    return this.toPurchaseDetail(purchase);
  }

  async listApprovalTasks(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<ApprovalTask[]> {
    return this.purchases
      .filter((purchase) => purchase.organizationId === organizationId)
      .flatMap((purchase) =>
        purchase.approvalRequests
          .filter(
            (request) =>
              request.status === 'PENDING' &&
              request.participants.some(
                (participant) =>
                  participant.userId === actor.id &&
                  participant.decision === 'PENDING',
              ),
          )
          .map((request) => ({
            requestId: request.requestId,
            purchaseId: purchase.id,
            purchaseNumber: purchase.number,
            supplierName: this.supplierName(purchase.supplierId),
            total: request.amountSnapshot,
            category: purchase.category,
            submittedAt: request.submittedAt,
            approvedCount: request.participants.filter(
              (participant) => participant.decision === 'APPROVED',
            ).length,
            requiredApprovals: request.requiredApprovals,
          })),
      )
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  }

  async listApprovalRules(organizationId: string): Promise<ApprovalRule[]> {
    return this.approvalRules
      .filter((rule) => rule.organizationId === organizationId)
      .sort((left, right) => left.minimumAmount - right.minimumAmount)
      .map(({ organizationId: _organizationId, ...rule }) => structuredClone(rule));
  }

  async createApprovalRule(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateApprovalRuleInput,
  ): Promise<ApprovalRule> {
    if (
      this.approvalRules.some(
        (rule) =>
          rule.organizationId === organizationId &&
          rule.minimumAmount === input.minimumAmount,
      )
    ) {
      throw new ConflictException('Ja existe uma regra para este valor minimo.');
    }
    const approvers = input.approverUserIds.map((userId) =>
      requireDemoApprover(userId, input.notificationChannel),
    );
    const now = new Date().toISOString();
    const rule: ApprovalRule & { organizationId: string } = {
      id: randomUUID(),
      organizationId,
      name: input.name,
      minimumAmount: input.minimumAmount,
      requiredApprovals: input.requiredApprovals,
      notificationChannel: input.notificationChannel,
      active: input.active,
      approvers,
      createdAt: now,
      updatedAt: now,
    };
    this.approvalRules.push(rule);
    const { organizationId: _organizationId, ...result } = rule;
    return structuredClone(result);
  }

  async updateApprovalRule(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateApprovalRuleInput,
  ): Promise<ApprovalRule> {
    const rule = this.approvalRules.find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.id === id,
    );
    if (!rule) {
      throw new NotFoundException('Regra de aprovacao nao encontrada.');
    }
    if (rule.updatedAt !== input.expectedUpdatedAt) {
      throw new ConflictException(
        'A regra foi alterada por outro usuario. Atualize os dados.',
      );
    }
    if (
      this.approvalRules.some(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.id !== id &&
          candidate.minimumAmount === input.minimumAmount,
      )
    ) {
      throw new ConflictException('Ja existe uma regra para este valor minimo.');
    }
    Object.assign(rule, {
      active: input.active,
      minimumAmount: input.minimumAmount,
      name: input.name,
      notificationChannel: input.notificationChannel,
      requiredApprovals: input.requiredApprovals,
      approvers: input.approverUserIds.map((userId) =>
        requireDemoApprover(userId, input.notificationChannel),
      ),
      updatedAt: nextTimestamp(rule.updatedAt),
    });
    const { organizationId: _organizationId, ...result } = rule;
    return structuredClone(result);
  }

  async getApprovalSettings(organizationId: string): Promise<ApprovalSettings> {
    return structuredClone(
      this.approvalSettings.get(organizationId) ?? {
        financeChannel: null,
        financeRecipient: null,
        notifyFinanceOnApproval: false,
        updatedAt: null,
      },
    );
  }

  async updateApprovalSettings(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpdateApprovalSettingsInput,
  ): Promise<ApprovalSettings> {
    const settings: ApprovalSettings = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.approvalSettings.set(organizationId, settings);
    return structuredClone(settings);
  }

  async getAccountsPayable(
    organizationId: string,
    filters: AccountsPayableFilters,
  ): Promise<AccountsPayableReport> {
    return buildDemoAccountsPayableReport(
      this.purchases.filter(
        (purchase) =>
          purchase.organizationId === organizationId &&
          purchase.status !== 'CANCELLED' &&
          demoWorkflowStageIndex(purchase.workflowStage) >=
            demoWorkflowStageIndex('PURCHASE_ORDER'),
      ),
      this.suppliers,
      filters,
    );
  }

  async schedulePayable(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: SchedulePayableInput,
  ): Promise<PurchaseDetail> {
    const purchase = this.requireStoredPurchase(organizationId, purchaseId);
    if (
      purchase.status === 'CANCELLED' ||
      demoWorkflowStageIndex(purchase.workflowStage) <
        demoWorkflowStageIndex('PURCHASE_ORDER')
    ) {
      throw new NotFoundException('Compra aprovada nao encontrada.');
    }
    if (purchase.installments.length) {
      throw new BadRequestException('Esta compra ja possui parcelas cadastradas.');
    }
    if (purchase.updatedAt !== input.expectedUpdatedAt) {
      throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
    }
    purchase.installments.push({
      sequence: 1,
      dueDate: input.dueDate,
      amount: purchase.total,
      paidAt: null,
      paymentChannel: input.paymentChannel,
      paymentReference: input.paymentReference,
      paymentNotes: input.paymentNotes,
    });
    purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    return this.toPurchaseDetail(purchase);
  }

  async updatePayable(
    _actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    sequence: number,
    input: UpdatePayableInput,
  ): Promise<PurchaseDetail> {
    const purchase = this.requireStoredPurchase(organizationId, purchaseId);
    if (
      purchase.status === 'CANCELLED' ||
      demoWorkflowStageIndex(purchase.workflowStage) <
        demoWorkflowStageIndex('PURCHASE_ORDER')
    ) {
      throw new NotFoundException('Conta a pagar nao encontrada.');
    }
    if (purchase.updatedAt !== input.expectedUpdatedAt) {
      throw new ConflictException('A compra foi alterada por outro usuario. Atualize os dados.');
    }
    const installment = purchase.installments.find(
      (candidate) => candidate.sequence === sequence,
    );
    if (!installment) {
      throw new NotFoundException('Conta a pagar nao encontrada.');
    }
    if (input.dueDate !== undefined) installment.dueDate = input.dueDate;
    if (input.paidAt !== undefined) installment.paidAt = input.paidAt;
    if (input.paymentChannel !== undefined) {
      installment.paymentChannel = input.paymentChannel;
    }
    if (input.paymentReference !== undefined) {
      installment.paymentReference = input.paymentReference;
    }
    if (input.paymentNotes !== undefined) {
      installment.paymentNotes = input.paymentNotes;
    }
    purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    return this.toPurchaseDetail(purchase);
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
    actor: AuthenticatedIdentity,
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
    if (demoWorkflowStageIndex(purchase.workflowStage) < demoWorkflowStageIndex('PURCHASE_ORDER')) {
      throw new BadRequestException(
        'A nota fiscal so pode ser vinculada depois da aprovacao da compra.',
      );
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
    if (purchase.workflowStage === 'PURCHASE_ORDER') {
      this.moveStoredPurchase(
        purchase,
        'SUPPLIER_INVOICED',
        actor,
        'Nota fiscal vinculada.',
      );
    }
    purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    return this.toPurchaseSummary(purchase);
  }

  async getDashboardSummary(
    organizationId: string,
    filters: DashboardFilters,
  ): Promise<DashboardSummary> {
    const storedPurchases = this.filterDashboardPurchases(organizationId, filters);
    const previousFilters = previousDashboardPeriodFilters(filters);
    const previousPurchases = previousFilters
      ? this.filterDashboardPurchases(organizationId, previousFilters)
      : null;
    const purchases = storedPurchases.map((purchase) => this.toDashboardPurchase(purchase));
    const previousPeriodTotals = previousPurchases
      ? {
          purchased: previousPurchases.reduce((sum, purchase) => sum + purchase.total, 0),
          negotiatedSavings: previousPurchases.reduce(
            (sum, purchase) => sum + purchase.negotiatedSavings,
            0,
          ),
        }
      : null;
    const activeSuppliers = this.suppliers.filter(
      (supplier) => supplier.organizationId === organizationId && supplier.status === 'ACTIVE',
    ).length;
    return buildDashboardSummary({
      activeSuppliers,
      dataSource: 'DEMO',
      filters,
      previousPeriodTotals,
      purchases,
    });
  }

  private filterDashboardPurchases(
    organizationId: string,
    filters: DashboardFilters,
  ): StoredPurchase[] {
    return this.purchases
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
      );
  }

  private toDashboardPurchase(purchase: StoredPurchase): DashboardPurchase {
    return {
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
    };
  }

  async getProcurementReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementReport> {
    const purchases = this.purchases
      .filter((purchase) => purchase.organizationId === organizationId)
      .filter((purchase) => !filters.status || purchase.status === filters.status)
      .filter(
        (purchase) =>
          !filters.workflowStage || purchase.workflowStage === filters.workflowStage,
      )
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
        workflowStage: purchase.workflowStage,
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
          workflowStage: purchase.workflowStage,
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
            pixKeyType: supplier.pixKeyType,
            pixKey: supplier.pixKey,
            paymentLink: supplier.paymentLink,
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

  private moveStoredPurchase(
    purchase: StoredPurchase,
    stage: PurchaseWorkflowStage,
    actor: AuthenticatedIdentity,
    reason: string | null,
  ) {
    const fromStage = purchase.workflowStage;
    purchase.workflowStage = stage;
    purchase.status = demoLifecycleStatusForStage(stage);
    purchase.updatedAt = nextTimestamp(purchase.updatedAt);
    purchase.stageHistory.push({
      id: randomUUID(),
      fromStage,
      toStage: stage,
      changedById: actor.id,
      changedByName: actor.name,
      reason,
      createdAt: purchase.updatedAt,
    });
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
    const workflowStage = initialDemoWorkflowStage(input);
    if (
      input.invoiceNumber &&
      demoWorkflowStageIndex(workflowStage) < demoWorkflowStageIndex('PURCHASE_ORDER')
    ) {
      throw new BadRequestException(
        'A nota fiscal so pode ser vinculada depois que o pedido for aprovado.',
      );
    }
    return {
      id: randomUUID(),
      organizationId,
      number: input.number,
      invoiceNumber: input.invoiceNumber ?? null,
      supplierId: input.supplierId,
      issuedAt: input.issuedAt,
      status: demoLifecycleStatusForStage(workflowStage),
      workflowStage,
      approvalRequests: [],
      stageHistory: [],
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
        paymentChannel: installment.paymentChannel ?? null,
        paymentReference: installment.paymentReference ?? null,
        paymentNotes: installment.paymentNotes ?? null,
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
      updatedAt: purchase.updatedAt,
      workflowStage: purchase.workflowStage,
      invoiceLinked: purchase.invoiceNumber !== null,
      approval: purchase.approvalRequests.length
        ? toStoredApprovalSummary(
            purchase.approvalRequests[purchase.approvalRequests.length - 1]!,
          )
        : null,
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
      approval: purchase.approvalRequests.length
        ? {
            ...toStoredApprovalSummary(
              purchase.approvalRequests[purchase.approvalRequests.length - 1]!,
            ),
            amountSnapshot:
              purchase.approvalRequests[purchase.approvalRequests.length - 1]!
                .amountSnapshot,
            participants: purchase.approvalRequests[
              purchase.approvalRequests.length - 1
            ]!.participants.map((participant) => ({ ...participant })),
          }
        : null,
      stageHistory: purchase.stageHistory.map((history) => ({ ...history })),
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

function toStoredApprovalSummary(request: StoredApprovalRequest) {
  return {
    requestId: request.requestId,
    status: request.status,
    ruleName: request.ruleName,
    requiredApprovals: request.requiredApprovals,
    approvedCount: request.participants.filter(
      (participant) => participant.decision === 'APPROVED',
    ).length,
    rejectedCount: request.participants.filter(
      (participant) => participant.decision === 'REJECTED',
    ).length,
    submittedAt: request.submittedAt,
    resolvedAt: request.resolvedAt,
  };
}

function initialDemoWorkflowStage(input: PersistPurchaseInput): PurchaseWorkflowStage {
  if (input.workflowStage) return input.workflowStage;
  if (input.source === 'INVOICE') return 'SUPPLIER_INVOICED';
  if (input.source === 'CSV' || input.source === 'GOOGLE_SHEETS') {
    return 'PURCHASE_ORDER';
  }
  return 'REGISTRATION';
}

const demoWorkflowStages: PurchaseWorkflowStage[] = [
  'REGISTRATION',
  'REQUESTED',
  'AWAITING_APPROVAL',
  'PURCHASE_ORDER',
  'SUPPLIER_INVOICED',
  'RECEIVED',
  'COMPLETED',
];

function demoWorkflowStageIndex(stage: PurchaseWorkflowStage): number {
  return demoWorkflowStages.indexOf(stage);
}

function demoLifecycleStatusForStage(stage: PurchaseWorkflowStage): 'DRAFT' | 'REGISTERED' {
  return demoWorkflowStageIndex(stage) >= demoWorkflowStageIndex('PURCHASE_ORDER')
    ? 'REGISTERED'
    : 'DRAFT';
}

function assertDemoManualStageTransition(
  from: PurchaseWorkflowStage,
  to: PurchaseWorkflowStage,
  reason: string | null,
  invoiceLinked: boolean,
) {
  const allowed: Record<PurchaseWorkflowStage, PurchaseWorkflowStage[]> = {
    REGISTRATION: ['REQUESTED'],
    REQUESTED: ['REGISTRATION'],
    AWAITING_APPROVAL: [],
    PURCHASE_ORDER: ['REQUESTED', 'SUPPLIER_INVOICED'],
    SUPPLIER_INVOICED: ['PURCHASE_ORDER', 'RECEIVED'],
    RECEIVED: ['SUPPLIER_INVOICED', 'COMPLETED'],
    COMPLETED: ['RECEIVED'],
  };
  if (!allowed[from].includes(to)) {
    if (to === 'AWAITING_APPROVAL' || to === 'PURCHASE_ORDER') {
      throw new BadRequestException(
        'Use a acao de enviar para aprovacao; estas etapas nao podem ser ignoradas.',
      );
    }
    throw new BadRequestException('Esta mudanca de etapa nao e permitida.');
  }
  if ((to === 'SUPPLIER_INVOICED' || to === 'COMPLETED') && !invoiceLinked) {
    throw new BadRequestException(
      'Vincule uma nota fiscal antes de concluir esta etapa.',
    );
  }
  if (to === 'REQUESTED' && invoiceLinked) {
    throw new BadRequestException(
      'Uma compra com nota fiscal vinculada nao pode voltar para solicitacao.',
    );
  }
  if (demoWorkflowStageIndex(to) < demoWorkflowStageIndex(from) && !reason) {
    throw new BadRequestException('Informe o motivo para retornar a compra de etapa.');
  }
}

function requireDemoApprover(
  userId: string,
  channel: 'EMAIL' | 'WHATSAPP',
): ApprovalRule['approvers'][number] {
  const users: Record<
    string,
    { name: string; email: string; phone: string | null }
  > = {
    [DEMO_USER_ID]: {
      name: 'Proprietario da plataforma',
      email: 'proprietario@plataforma.local',
      phone: '+5511999999999',
    },
    [DEMO_BUYER_USER_ID]: {
      name: 'Equipe de Compras',
      email: 'compras@humanclinic.com.br',
      phone: '+5511988888888',
    },
  };
  const user = users[userId];
  if (!user) {
    throw new BadRequestException(
      'Todos os aprovadores devem ser usuarios ativos desta empresa.',
    );
  }
  if (channel === 'WHATSAPP' && !user.phone) {
    throw new BadRequestException(
      'O aprovador precisa ter um WhatsApp no formato internacional.',
    );
  }
  return { userId, ...user };
}

function buildDemoAccountsPayableReport(
  purchases: StoredPurchase[],
  suppliers: StoredSupplier[],
  filters: AccountsPayableFilters,
): AccountsPayableReport {
  const today = currentBusinessIsoDate();
  const allRows: AccountsPayableReport['rows'] = [];
  for (const purchase of purchases) {
    if (filters.supplierId && purchase.supplierId !== filters.supplierId) continue;
    if (filters.workflowStage && purchase.workflowStage !== filters.workflowStage) {
      continue;
    }
    const supplier = suppliers.find(
      (candidate) =>
        candidate.organizationId === purchase.organizationId &&
        candidate.id === purchase.supplierId,
    );
    if (!supplier) continue;
    const defaultChannel = supplier.pixKey
      ? ('PIX' as const)
      : supplier.paymentLink
        ? ('CARD_LINK' as const)
        : null;
    const defaultReference = supplier.pixKey ?? supplier.paymentLink ?? null;
    if (!purchase.installments.length) {
      allRows.push({
        id: `unscheduled-${purchase.id}`,
        purchaseId: purchase.id,
        purchaseNumber: purchase.number,
        purchaseUpdatedAt: purchase.updatedAt,
        invoiceNumber: purchase.invoiceNumber,
        supplierId: purchase.supplierId,
        supplierName: supplier.tradeName ?? supplier.legalName,
        sequence: 0,
        dueDate: null,
        amount: purchase.total,
        paidAt: null,
        status: 'UNSCHEDULED',
        paymentChannel: defaultChannel,
        paymentReference: defaultReference,
        paymentNotes: null,
        workflowStage: purchase.workflowStage,
      });
      continue;
    }
    for (const installment of purchase.installments) {
      allRows.push({
        id: `${purchase.id}-${installment.sequence}`,
        purchaseId: purchase.id,
        purchaseNumber: purchase.number,
        purchaseUpdatedAt: purchase.updatedAt,
        invoiceNumber: purchase.invoiceNumber,
        supplierId: purchase.supplierId,
        supplierName: supplier.tradeName ?? supplier.legalName,
        sequence: installment.sequence,
        dueDate: installment.dueDate,
        amount: installment.amount,
        paidAt: installment.paidAt,
        status: installment.paidAt
          ? 'PAID'
          : installment.dueDate < today
            ? 'OVERDUE'
            : 'PENDING',
        paymentChannel: installment.paymentChannel ?? defaultChannel,
        paymentReference: installment.paymentReference ?? defaultReference,
        paymentNotes: installment.paymentNotes,
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
  const sumStatus = (...statuses: Array<AccountsPayableReport['rows'][number]['status']>) =>
    roundMoney(
      rows
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row.amount, 0),
    );
  const dueIn = (days: number) => {
    const end = addDemoIsoDays(today, days);
    return roundMoney(
      rows
        .filter(
          (row) =>
            row.status === 'PENDING' &&
            row.dueDate !== null &&
            row.dueDate >= today &&
            row.dueDate <= end,
        )
        .reduce((sum, row) => sum + row.amount, 0),
    );
  };
  return {
    dataSource: 'DEMO',
    generatedAt: new Date().toISOString(),
    totals: {
      open: sumStatus('PENDING', 'OVERDUE'),
      overdue: sumStatus('OVERDUE'),
      dueIn7Days: dueIn(7),
      dueIn15Days: dueIn(15),
      dueIn30Days: dueIn(30),
      paid: sumStatus('PAID'),
      unscheduled: sumStatus('UNSCHEDULED'),
      rowCount: rows.length,
    },
    rows,
  };
}

function addDemoIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
    pixKeyType: null,
    pixKey: null,
    paymentLink: null,
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
    workflowStage: 'PURCHASE_ORDER',
    approvalRequests: [],
    stageHistory: [
      {
        id: randomUUID(),
        fromStage: null,
        toStage: 'PURCHASE_ORDER',
        changedById: DEMO_USER_ID,
        changedByName: 'Proprietario da plataforma',
        reason: 'Registro historico demonstrativo.',
        createdAt: timestamp,
      },
    ],
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
    installments: [
      {
        sequence: 1,
        dueDate: addDemoIsoDays(issuedAt, 30),
        amount: total,
        paidAt: null,
        paymentChannel: 'BOLETO',
        paymentReference: null,
        paymentNotes: null,
      },
    ],
  };
}

function seedApprovalRules(): Array<ApprovalRule & { organizationId: string }> {
  return [
    demoApprovalRule(
      HUMAN_CLINIC_ID,
      '81000000-0000-4000-8000-000000000001',
      'Aprovacao simples',
      0,
      1,
      [DEMO_USER_ID],
    ),
    demoApprovalRule(
      HUMAN_CLINIC_ID,
      '81000000-0000-4000-8000-000000000002',
      'Dupla aprovacao',
      5_000,
      2,
      [DEMO_USER_ID, DEMO_BUYER_USER_ID],
    ),
    demoApprovalRule(
      EXAMPLE_COMPANY_ID,
      '82000000-0000-4000-8000-000000000001',
      'Aprovacao padrao',
      0,
      1,
      [DEMO_USER_ID],
    ),
  ];
}

function demoApprovalRule(
  organizationId: string,
  id: string,
  name: string,
  minimumAmount: number,
  requiredApprovals: number,
  userIds: string[],
): ApprovalRule & { organizationId: string } {
  return {
    id,
    organizationId,
    name,
    minimumAmount,
    requiredApprovals,
    notificationChannel: 'EMAIL',
    active: true,
    approvers: userIds.map((userId) => requireDemoApprover(userId, 'EMAIL')),
    createdAt: INITIAL_DATE,
    updatedAt: INITIAL_DATE,
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
