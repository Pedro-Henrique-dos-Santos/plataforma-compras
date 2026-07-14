import type {
  AttachPurchaseInvoiceInput,
  CostCenter,
  CreateCostCenterInput,
  CreatePurchaseInput,
  CreateSupplierInput,
  CreateSupplierPriceInput,
  DashboardSummary,
  ImportSupplierPricesInput,
  PurchaseImportInput,
  PurchaseImportResult,
  PurchaseSummary,
  Supplier,
  SupplierPrice,
  SupplierPriceImportResult,
  UpdateCostCenterInput,
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

  abstract createPurchase(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreatePurchaseInput,
  ): Promise<PurchaseSummary>;

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

  abstract getDashboardSummary(organizationId: string): Promise<DashboardSummary>;
}
