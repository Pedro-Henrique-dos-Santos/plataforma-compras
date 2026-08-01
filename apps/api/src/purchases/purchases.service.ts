import { Inject, Injectable } from '@nestjs/common';
import type {
  AccountsPayableFilters,
  ChangePurchaseWorkflowStageInput,
  ChangePurchaseStatusInput,
  CreateApprovalRuleInput,
  CreatePurchaseInput,
  PurchaseImportInput,
  RecordApprovalDecisionInput,
  SchedulePayableInput,
  UpdateApprovalRuleInput,
  UpdateApprovalSettingsInput,
  UpdatePayableInput,
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

  changeWorkflowStage(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: ChangePurchaseWorkflowStageInput,
  ) {
    return this.repository.changePurchaseWorkflowStage(
      actor,
      organizationId,
      id,
      input,
    );
  }

  submitForApproval(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    expectedUpdatedAt: string,
  ) {
    return this.repository.submitPurchaseForApproval(
      actor,
      organizationId,
      id,
      expectedUpdatedAt,
    );
  }

  approvalTasks(actor: AuthenticatedIdentity, organizationId: string) {
    return this.repository.listApprovalTasks(actor, organizationId);
  }

  recordApprovalDecision(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: RecordApprovalDecisionInput,
  ) {
    return this.repository.recordApprovalDecision(actor, organizationId, input);
  }

  approvalRules(organizationId: string) {
    return this.repository.listApprovalRules(organizationId);
  }

  createApprovalRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: CreateApprovalRuleInput,
  ) {
    return this.repository.createApprovalRule(actor, organizationId, input);
  }

  updateApprovalRule(
    actor: AuthenticatedIdentity,
    organizationId: string,
    id: string,
    input: UpdateApprovalRuleInput,
  ) {
    return this.repository.updateApprovalRule(actor, organizationId, id, input);
  }

  approvalSettings(organizationId: string) {
    return this.repository.getApprovalSettings(organizationId);
  }

  updateApprovalSettings(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: UpdateApprovalSettingsInput,
  ) {
    return this.repository.updateApprovalSettings(actor, organizationId, input);
  }

  accountsPayable(organizationId: string, filters: AccountsPayableFilters) {
    return this.repository.getAccountsPayable(organizationId, filters);
  }

  schedulePayable(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    input: SchedulePayableInput,
  ) {
    return this.repository.schedulePayable(
      actor,
      organizationId,
      purchaseId,
      input,
    );
  }

  updatePayable(
    actor: AuthenticatedIdentity,
    organizationId: string,
    purchaseId: string,
    sequence: number,
    input: UpdatePayableInput,
  ) {
    return this.repository.updatePayable(
      actor,
      organizationId,
      purchaseId,
      sequence,
      input,
    );
  }

  import(
    actor: AuthenticatedIdentity,
    organizationId: string,
    input: PurchaseImportInput,
  ) {
    return this.repository.importPurchases(actor, organizationId, input);
  }
}
