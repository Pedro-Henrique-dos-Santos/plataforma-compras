import { Inject, Injectable } from '@nestjs/common';
import type {
  ChangePurchaseStatusInput,
  CreatePurchaseInput,
  PurchaseImportInput,
  UpdatePurchaseInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import {
  ProcurementRepository,
  type PurchaseFilters,
} from '../procurement/procurement.repository.js';

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(ProcurementRepository)
    private readonly repository: ProcurementRepository,
  ) {}

  list(organizationId: string, filters: PurchaseFilters) {
    return this.repository.listPurchases(organizationId, filters);
  }

  detail(organizationId: string, id: string) {
    return this.repository.getPurchase(organizationId, id);
  }

  create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreatePurchaseInput,
  ) {
    return this.repository.createPurchase(actor, organizationId, input);
  }

  update(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdatePurchaseInput,
  ) {
    return this.repository.updatePurchase(actor, organizationId, id, input);
  }

  changeStatus(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseStatusInput,
  ) {
    return this.repository.changePurchaseStatus(actor, organizationId, id, input);
  }

  import(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PurchaseImportInput,
  ) {
    return this.repository.importPurchases(actor, organizationId, input);
  }
}
