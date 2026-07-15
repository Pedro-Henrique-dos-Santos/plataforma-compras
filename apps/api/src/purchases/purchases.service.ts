import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatePurchaseInput,
  PurchaseImportInput,
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

  create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreatePurchaseInput,
  ) {
    return this.repository.createPurchase(actor, organizationId, input);
  }

  import(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PurchaseImportInput,
  ) {
    return this.repository.importPurchases(actor, organizationId, input);
  }
}
