import { Inject, Injectable } from '@nestjs/common';
import type {
  ChangeReceivableStatusInput,
  CreateReceivableInput,
  CreateReceivableSettlementInput,
  ReceivableFilters,
  UpdateReceivableInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { buildReceivablesWorkbook } from './receivables-workbook.js';
import { ReceivablesRepository } from './receivables.repository.js';

@Injectable()
export class ReceivablesService {
  constructor(
    @Inject(ReceivablesRepository)
    private readonly repository: ReceivablesRepository,
  ) {}

  list(organizationId: string, filters: ReceivableFilters) {
    return this.repository.list(organizationId, filters);
  }

  report(organizationId: string, filters: ReceivableFilters) {
    return this.repository.report(organizationId, filters);
  }

  async exportWorkbook(
    organizationId: string,
    organizationName: string,
    filters: ReceivableFilters,
  ) {
    return buildReceivablesWorkbook(
      await this.repository.report(organizationId, filters),
      organizationName,
    );
  }

  create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateReceivableInput,
  ) {
    return this.repository.create(actor, organizationId, input);
  }

  update(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateReceivableInput,
  ) {
    return this.repository.update(actor, organizationId, id, input);
  }

  settle(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: CreateReceivableSettlementInput,
  ) {
    return this.repository.settle(actor, organizationId, id, input);
  }

  changeStatus(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangeReceivableStatusInput,
  ) {
    return this.repository.changeStatus(actor, organizationId, id, input);
  }
}
