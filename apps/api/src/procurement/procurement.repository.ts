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
  CreatePurchaseInput,
  CreateSupplierInput,
  CreateSupplierPriceInput,
  DashboardFilters,
  DashboardSummary,
  ImportSupplierPricesInput,
  PurchaseImportInput,
  PurchaseImportResult,
  PurchaseDetail,
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

import type { AuthenticatedIdentity } from '../domain/identity.js';

export type CostCenterFilters = {
  includeInactive?: boolean;
  search?: string;
};

export type SupplierFilters = {
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
};

export type SupplierPriceFilters = {
  search?: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'INACTIVE';
  supplierId?: string;
};

export type PurchaseFilters = {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  status?: 'DRAFT' | 'REGISTERED' | 'CANCELLED';
  workflowStage?: PurchaseWorkflowStage;
};

export type PersistPurchaseInput = Omit<CreatePurchaseInput, 'issuedAt' | 'workflowStage'> & {
  issuedAt: string | null;
  workflowStage?: CreatePurchaseInput['workflowStage'];
};

export abstract class ProcurementRepository {
  abstract listCostCenters(
    organizationId: string,
    filters?: CostCenterFilters,
  ): Promise<CostCenter[]>;

  abstract findCostCenter(organizationId: string, id: string): Promise<CostCenter | null>;

  abstract createCostCenter(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateCostCenterInput,
  ): Promise<CostCenter>;

  abstract updateCostCenter(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateCostCenterInput,
  ): Promise<CostCenter>;

  abstract listSuppliers(
    organizationId: string,
    filters?: SupplierFilters,
  ): Promise<Supplier[]>;

  abstract findSupplier(organizationId: string, id: string): Promise<Supplier | null>;

  abstract createSupplier(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierInput,
  ): Promise<Supplier>;

  abstract updateSupplier(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierInput,
  ): Promise<Supplier>;

  abstract listSupplierPrices(
    organizationId: string,
    filters?: SupplierPriceFilters,
  ): Promise<SupplierPrice[]>;

  abstract createSupplierPrice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierPriceInput,
  ): Promise<SupplierPrice>;

  abstract updateSupplierPrice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierPriceInput,
  ): Promise<SupplierPrice>;

  abstract importSupplierPrices(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: ImportSupplierPricesInput,
  ): Promise<SupplierPriceImportResult>;

  abstract listPurchases(
    organizationId: string,
    filters?: PurchaseFilters,
  ): Promise<PurchaseSummary[]>;

  abstract getPurchase(organizationId: string, id: string): Promise<PurchaseDetail>;

  abstract createPurchase(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PersistPurchaseInput,
  ): Promise<PurchaseSummary>;

  abstract updatePurchase(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdatePurchaseInput,
  ): Promise<PurchaseDetail>;

  abstract changePurchaseStatus(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseStatusInput,
  ): Promise<PurchaseSummary>;

  abstract changePurchaseWorkflowStage(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseWorkflowStageInput,
  ): Promise<PurchaseDetail>;

  abstract submitPurchaseForApproval(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    expectedUpdatedAt: string,
  ): Promise<PurchaseDetail>;

  abstract recordApprovalDecision(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: RecordApprovalDecisionInput,
  ): Promise<PurchaseDetail>;

  abstract listApprovalTasks(
    actor: AuthenticatedIdentity,
    organizationId: string,
  ): Promise<ApprovalTask[]>;

  abstract listApprovalRules(organizationId: string): Promise<ApprovalRule[]>;

  abstract createApprovalRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateApprovalRuleInput,
  ): Promise<ApprovalRule>;

  abstract updateApprovalRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateApprovalRuleInput,
  ): Promise<ApprovalRule>;

  abstract getApprovalSettings(organizationId: string): Promise<ApprovalSettings>;

  abstract updateApprovalSettings(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpdateApprovalSettingsInput,
  ): Promise<ApprovalSettings>;

  abstract getAccountsPayable(
    organizationId: string,
    filters: AccountsPayableFilters,
  ): Promise<AccountsPayableReport>;

  abstract schedulePayable(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: SchedulePayableInput,
  ): Promise<PurchaseDetail>;

  abstract updatePayable(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    sequence: number,
    input: UpdatePayableInput,
  ): Promise<PurchaseDetail>;

  abstract importPurchases(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PurchaseImportInput,
  ): Promise<PurchaseImportResult>;

  abstract attachPurchaseInvoice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: AttachPurchaseInvoiceInput,
  ): Promise<PurchaseSummary>;

  abstract getDashboardSummary(
    organizationId: string,
    filters: DashboardFilters,
  ): Promise<DashboardSummary>;

  abstract getProcurementReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementReport>;

  abstract getProcurementDetailedReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementDetailedReport>;
}
