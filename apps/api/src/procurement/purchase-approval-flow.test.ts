import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEMO_AUTH_USER_ID,
  DEMO_USER_ID,
  EXAMPLE_COMPANY_ID,
  HUMAN_CLINIC_ID,
} from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { DemoProcurementRepository } from './demo-procurement.repository.js';

const owner: AuthenticatedIdentity = {
  id: DEMO_USER_ID,
  authUserId: DEMO_AUTH_USER_ID,
  email: 'owner@example.com',
  name: 'Owner',
  platformRoles: ['PLATFORM_OWNER'],
};

const buyer: AuthenticatedIdentity = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  authUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  email: 'buyer@example.com',
  name: 'Buyer',
  platformRoles: [],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('purchase approval workflow', () => {
  it('requires two distinct approvals above the threshold and creates a payable', async () => {
    const repository = new DemoProcurementRepository();
    const supplier = await repository.createSupplier(owner, HUMAN_CLINIC_ID, {
      legalName: 'Fornecedor com Pix Ltda',
      tradeName: 'Fornecedor Pix',
      document: '11222333000181',
      category: 'Materiais',
      operationNature: 'Compra para consumo',
      paymentMethod: 'PIX',
      pixKeyType: 'CNPJ',
      pixKey: '11222333000181',
      paymentLink: null,
      defaultCostCenterId: null,
      email: 'financeiro@fornecedor.example',
      phone: null,
      notes: null,
    });
    const created = await repository.createPurchase(
      owner,
      HUMAN_CLINIC_ID,
      purchaseInput(supplier.id, 'APROVACAO-DUPLA-001', 6_000),
    );

    expect(created).toMatchObject({
      status: 'DRAFT',
      workflowStage: 'REGISTRATION',
    });
    const requested = await repository.changePurchaseWorkflowStage(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      {
        expectedUpdatedAt: created.updatedAt,
        stage: 'REQUESTED',
        reason: null,
      },
    );
    const submitted = await repository.submitPurchaseForApproval(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      requested.updatedAt,
    );

    expect(submitted.workflowStage).toBe('AWAITING_APPROVAL');
    expect(submitted.approval).toMatchObject({
      status: 'PENDING',
      requiredApprovals: 2,
      approvedCount: 0,
    });
    expect(await repository.listApprovalTasks(owner, HUMAN_CLINIC_ID)).toHaveLength(1);
    expect(await repository.listApprovalTasks(buyer, HUMAN_CLINIC_ID)).toHaveLength(1);
    expect(await repository.listApprovalTasks(owner, EXAMPLE_COMPANY_ID)).toHaveLength(0);

    const requestId = submitted.approval?.requestId;
    expect(requestId).toBeDefined();
    if (!requestId) return;
    const firstDecision = await repository.recordApprovalDecision(
      owner,
      HUMAN_CLINIC_ID,
      {
        requestId,
        decision: 'APPROVED',
        comment: null,
      },
    );

    expect(firstDecision.workflowStage).toBe('AWAITING_APPROVAL');
    expect(firstDecision.approval).toMatchObject({
      status: 'PENDING',
      approvedCount: 1,
    });
    await expect(
      repository.recordApprovalDecision(owner, HUMAN_CLINIC_ID, {
        requestId,
        decision: 'APPROVED',
        comment: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const approved = await repository.recordApprovalDecision(
      buyer,
      HUMAN_CLINIC_ID,
      {
        requestId,
        decision: 'APPROVED',
        comment: 'Compra dentro do planejamento.',
      },
    );

    expect(approved).toMatchObject({
      status: 'REGISTERED',
      workflowStage: 'PURCHASE_ORDER',
    });
    expect(approved.approval).toMatchObject({
      status: 'APPROVED',
      approvedCount: 2,
    });
    expect(await repository.listApprovalTasks(owner, HUMAN_CLINIC_ID)).toHaveLength(0);
    expect(await repository.listApprovalTasks(buyer, HUMAN_CLINIC_ID)).toHaveLength(0);

    const payable = await repository.getAccountsPayable(HUMAN_CLINIC_ID, {
      supplierId: supplier.id,
    });
    expect(payable.rows).toHaveLength(1);
    expect(payable.rows[0]).toMatchObject({
      purchaseId: approved.id,
      paymentChannel: 'PIX',
      paymentReference: '11222333000181',
      status: 'PENDING',
    });

    const paid = await repository.updatePayable(
      owner,
      HUMAN_CLINIC_ID,
      approved.id,
      1,
      {
        expectedUpdatedAt: approved.updatedAt,
        paidAt: '2099-08-10',
        paymentChannel: 'BOLETO',
        paymentReference: 'Linha digitavel validada',
        paymentNotes: 'Pagamento confirmado pelo financeiro.',
      },
    );
    expect(paid.installments[0]).toMatchObject({
      paidAt: '2099-08-10',
      paymentChannel: 'BOLETO',
      paymentReference: 'Linha digitavel validada',
    });
    const paidReport = await repository.getAccountsPayable(HUMAN_CLINIC_ID, {
      supplierId: supplier.id,
      status: 'PAID',
    });
    expect(paidReport.rows).toHaveLength(1);
    expect(
      await repository.getAccountsPayable(EXAMPLE_COMPANY_ID, {
        supplierId: supplier.id,
      }),
    ).toMatchObject({ rows: [] });

    const invoiced = await repository.attachPurchaseInvoice(
      owner,
      HUMAN_CLINIC_ID,
      approved.id,
      { invoiceNumber: 'NF-APROVADA-001' },
    );
    expect(invoiced).toMatchObject({
      invoiceLinked: true,
      workflowStage: 'SUPPLIER_INVOICED',
    });
    await expect(
      repository.updatePurchase(owner, HUMAN_CLINIC_ID, approved.id, {
        expectedUpdatedAt: invoiced.updatedAt,
        number: paid.number,
        invoiceNumber: invoiced.invoiceNumber,
        supplierId: paid.supplierId,
        issuedAt: paid.issuedAt,
        category: paid.category,
        operationNature: paid.operationNature,
        paymentMethod: paid.paymentMethod,
        notes: paid.notes,
        items: paid.items,
        installments: paid.installments,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const returnedToOrder = await repository.changePurchaseWorkflowStage(
      owner,
      HUMAN_CLINIC_ID,
      approved.id,
      {
        expectedUpdatedAt: invoiced.updatedAt,
        stage: 'PURCHASE_ORDER',
        reason: 'Conferencia fiscal em andamento.',
      },
    );
    await expect(
      repository.changePurchaseWorkflowStage(
        owner,
        HUMAN_CLINIC_ID,
        approved.id,
        {
          expectedUpdatedAt: returnedToOrder.updatedAt,
          stage: 'REQUESTED',
          reason: 'Tentativa de reabrir compra faturada.',
        },
      ),
    ).rejects.toThrow(/nota fiscal vinculada/i);
  });

  it('returns rejected purchases to request and cancels pending approvals atomically', async () => {
    const repository = new DemoProcurementRepository();
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    expect(supplier).toBeDefined();
    if (!supplier) return;
    const created = await repository.createPurchase(
      owner,
      HUMAN_CLINIC_ID,
      purchaseInput(supplier.id, 'APROVACAO-SIMPLES-001', 100),
    );
    await expect(
      repository.updatePayable(owner, HUMAN_CLINIC_ID, created.id, 1, {
        expectedUpdatedAt: created.updatedAt,
        paidAt: '2099-08-10',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const requested = await repository.changePurchaseWorkflowStage(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      {
        expectedUpdatedAt: created.updatedAt,
        stage: 'REQUESTED',
        reason: null,
      },
    );
    const submitted = await repository.submitPurchaseForApproval(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      requested.updatedAt,
    );
    const requestId = submitted.approval?.requestId;
    expect(requestId).toBeDefined();
    if (!requestId) return;

    const rejected = await repository.recordApprovalDecision(
      owner,
      HUMAN_CLINIC_ID,
      {
        requestId,
        decision: 'REJECTED',
        comment: 'Revisar o centro de custo antes de aprovar.',
      },
    );
    expect(rejected).toMatchObject({
      status: 'DRAFT',
      workflowStage: 'REQUESTED',
    });
    expect(rejected.approval?.status).toBe('REJECTED');

    const resubmitted = await repository.submitPurchaseForApproval(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      rejected.updatedAt,
    );
    const cancelled = await repository.changePurchaseStatus(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      {
        expectedUpdatedAt: resubmitted.updatedAt,
        status: 'CANCELLED',
        reason: 'Solicitacao cancelada pelo comprador.',
      },
    );
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      workflowStage: 'REQUESTED',
    });
    expect(cancelled.approval?.status).toBe('CANCELLED');
    expect(await repository.listApprovalTasks(owner, HUMAN_CLINIC_ID)).toHaveLength(0);

    const reactivated = await repository.changePurchaseStatus(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      {
        expectedUpdatedAt: cancelled.updatedAt,
        status: 'REGISTERED',
        reason: 'Solicitacao reaberta.',
      },
    );
    expect(reactivated).toMatchObject({
      status: 'DRAFT',
      workflowStage: 'REQUESTED',
    });
  });

  it('schedules an approved purchase that arrived without installments', async () => {
    const repository = new DemoProcurementRepository();
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    expect(supplier).toBeDefined();
    if (!supplier) return;
    const created = await repository.createPurchase(owner, HUMAN_CLINIC_ID, {
      ...purchaseInput(supplier.id, 'AGENDAMENTO-001', 450),
      source: 'GOOGLE_SHEETS',
      sourceReference: 'AGENDAMENTO-001',
      installments: [],
    });
    expect(created.workflowStage).toBe('PURCHASE_ORDER');
    const before = await repository.getAccountsPayable(HUMAN_CLINIC_ID, {
      supplierId: supplier.id,
      status: 'UNSCHEDULED',
    });
    expect(before.rows.some((row) => row.purchaseId === created.id)).toBe(true);

    const scheduled = await repository.schedulePayable(
      owner,
      HUMAN_CLINIC_ID,
      created.id,
      {
        expectedUpdatedAt: created.updatedAt,
        dueDate: '2099-08-20',
        paymentChannel: 'BANK_TRANSFER',
        paymentReference: 'Conta bancaria validada',
        paymentNotes: null,
      },
    );
    expect(scheduled.installments).toEqual([
      expect.objectContaining({
        sequence: 1,
        dueDate: '2099-08-20',
        amount: 450,
        paymentChannel: 'BANK_TRANSFER',
      }),
    ]);
    await expect(
      repository.schedulePayable(owner, HUMAN_CLINIC_ID, created.id, {
        expectedUpdatedAt: scheduled.updatedAt,
        dueDate: '2099-08-21',
        paymentChannel: null,
        paymentReference: null,
        paymentNotes: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the Sao Paulo business date when classifying overdue payables', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T02:30:00.000Z'));
    const repository = new DemoProcurementRepository();
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    expect(supplier).toBeDefined();
    if (!supplier) return;

    const created = await repository.createPurchase(owner, HUMAN_CLINIC_ID, {
      ...purchaseInput(supplier.id, 'FUSO-001', 300),
      issuedAt: '2026-07-23',
      source: 'GOOGLE_SHEETS',
      sourceReference: 'FUSO-001',
      installments: [
        {
          dueDate: '2026-07-23',
          amount: 300,
          paymentChannel: 'PIX',
          paymentReference: null,
          paymentNotes: null,
        },
      ],
    });
    const report = await repository.getAccountsPayable(HUMAN_CLINIC_ID, {
      supplierId: supplier.id,
    });

    expect(
      report.rows.find((row) => row.purchaseId === created.id)?.status,
    ).toBe('PENDING');
  });
});

function purchaseInput(supplierId: string, number: string, total: number) {
  return {
    number,
    invoiceNumber: null,
    supplierId,
    issuedAt: '2099-07-23',
    category: 'Materiais',
    operationNature: 'Compra para consumo',
    paymentMethod: null,
    notes: null,
    source: 'MANUAL' as const,
    sourceReference: null,
    items: [
      {
        description: 'Insumos para homologacao',
        quantity: 1,
        unit: 'UN',
        unitPrice: total,
        negotiatedPrice: total,
        costCenterId: null,
        allocations: [],
      },
    ],
    installments: [
      {
        dueDate: '2099-08-15',
        amount: total,
      },
    ],
  };
}
