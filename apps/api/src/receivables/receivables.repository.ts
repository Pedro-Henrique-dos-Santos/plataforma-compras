import type {
  ChangeReceivableStatusInput,
  CreateReceivableInput,
  CreateReceivableSettlementInput,
  Receivable,
  ReceivableFilters,
  ReceivablesReport,
  UpdateReceivableInput,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';

export abstract class ReceivablesRepository {
  abstract list(
    organizationId: string,
    filters: ReceivableFilters,
  ): Promise<Receivable[]>;

  abstract report(
    organizationId: string,
    filters: ReceivableFilters,
  ): Promise<ReceivablesReport>;

  abstract create(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateReceivableInput,
  ): Promise<Receivable>;

  abstract update(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateReceivableInput,
  ): Promise<Receivable>;

  abstract settle(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: CreateReceivableSettlementInput,
  ): Promise<Receivable>;

  abstract changeStatus(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangeReceivableStatusInput,
  ): Promise<Receivable>;
}
