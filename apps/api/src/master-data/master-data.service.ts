import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateCostCenterInput,
  CreateSupplierInput,
  CreateSupplierPriceInput,
  ImportSupplierPricesInput,
  UpdateCostCenterInput,
  UpdateSupplierInput,
  UpdateSupplierPriceInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { CnpjLookupService } from './cnpj-lookup.service.js';
import {
  ProcurementRepository,
  type CostCenterFilters,
  type SupplierFilters,
  type SupplierPriceFilters,
} from '../procurement/procurement.repository.js';

@Injectable()
export class MasterDataService {
  constructor(
    @Inject(ProcurementRepository)
    private readonly repository: ProcurementRepository,
    @Inject(CnpjLookupService)
    private readonly cnpjLookup: CnpjLookupService,
  ) {}

  lookupSupplierCnpj(document: string) {
    return this.cnpjLookup.lookup(document);
  }

  listCostCenters(organizationId: string, filters: CostCenterFilters) {
    return this.repository.listCostCenters(organizationId, filters);
  }

  createCostCenter(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateCostCenterInput,
  ) {
    return this.repository.createCostCenter(actor, organizationId, input);
  }

  updateCostCenter(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateCostCenterInput,
  ) {
    return this.repository.updateCostCenter(actor, organizationId, id, input);
  }

  listSuppliers(organizationId: string, filters: SupplierFilters) {
    return this.repository.listSuppliers(organizationId, filters);
  }

  createSupplier(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierInput,
  ) {
    return this.repository.createSupplier(actor, organizationId, input);
  }

  updateSupplier(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierInput,
  ) {
    return this.repository.updateSupplier(actor, organizationId, id, input);
  }

  listSupplierPrices(organizationId: string, filters: SupplierPriceFilters) {
    return this.repository.listSupplierPrices(organizationId, filters);
  }

  createSupplierPrice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateSupplierPriceInput,
  ) {
    return this.repository.createSupplierPrice(actor, organizationId, input);
  }

  updateSupplierPrice(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateSupplierPriceInput,
  ) {
    return this.repository.updateSupplierPrice(actor, organizationId, id, input);
  }

  importSupplierPrices(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: ImportSupplierPricesInput,
  ) {
    return this.repository.importSupplierPrices(actor, organizationId, input);
  }
}
