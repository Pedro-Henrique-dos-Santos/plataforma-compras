import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@compras/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { PrismaProcurementRepository } from '../procurement/prisma-procurement.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaProcurementRepository(prisma);
const runId = randomUUID();
const suffix = runId.replaceAll('-', '').slice(0, 12);
const userId = randomUUID();
const organizationAId = randomUUID();
const organizationBId = randomUUID();
const organizationIds = [organizationAId, organizationBId];

const actor: AuthenticatedIdentity = {
  id: userId,
  authUserId: randomUUID(),
  email: `integration-${suffix}@example.invalid`,
  name: 'Integration Test',
  platformRoles: ['PLATFORM_OWNER'],
};

describe('Prisma multi-company security', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: userId,
        authUserId: actor.authUserId,
        email: actor.email,
        name: actor.name,
      },
    });
    await prisma.organization.createMany({
      data: [
        {
          id: organizationAId,
          name: 'Integration Company A',
          slug: `integration-a-${suffix}`,
          createdById: userId,
        },
        {
          id: organizationBId,
          name: 'Integration Company B',
          slug: `integration-b-${suffix}`,
          createdById: userId,
        },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: organizationIds.map((organizationId) => ({
        organizationId,
        userId,
        role: 'ORGANIZATION_ADMIN',
        status: 'ACTIVE',
      })),
    });
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { organizationId: { in: organizationIds } },
            { actorUserId: userId },
          ],
        },
      });
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('enables RLS on every application table', async () => {
    const tables = await prisma.$queryRaw<Array<{ tableName: string; rlsEnabled: boolean }>>`
      SELECT
        relation.relname AS "tableName",
        relation.relrowsecurity AS "rlsEnabled"
      FROM pg_class AS relation
      INNER JOIN pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind = 'r'
        AND relation.relname <> '_prisma_migrations'
      ORDER BY relation.relname ASC
    `;

    const expectedApplicationTables = [
      'approval_rule_approvers',
      'approval_rules',
      'approval_settings',
      'audit_logs',
      'cost_allocations',
      'cost_centers',
      'fiscal_document_items',
      'fiscal_integrations',
      'google_sheets_integrations',
      'goods_receipt_items',
      'goods_receipts',
      'installments',
      'invoice_documents',
      'notification_outbox',
      'organization_memberships',
      'organizations',
      'payment_approval_participants',
      'payment_approval_requests',
      'payment_approval_rule_approvers',
      'payment_approval_rules',
      'payment_approval_titles',
      'payment_instruction_snapshots',
      'payment_settlements',
      'payment_settings',
      'platform_role_assignments',
      'purchase_approval_participants',
      'purchase_approval_requests',
      'purchase_invoice_links',
      'purchase_items',
      'purchase_stage_history',
      'purchases',
      'receipt_responsibilities',
      'receivable_settlements',
      'receivables',
      'sheet_sync_runs',
      'supplier_prices',
      'suppliers',
      'users',
    ].sort();

    expect(tables.map((table) => table.tableName)).toEqual(expectedApplicationTables);
    expect(tables.filter((table) => !table.rlsEnabled)).toEqual([]);
  });

  it('rejects cross-company relationships at the database boundary', async () => {
    const centerA = await repository.createCostCenter(actor, organizationAId, {
      code: 'DB-GUARD-A',
      name: 'Database Guard A',
    });
    const centerB = await repository.createCostCenter(actor, organizationBId, {
      code: 'DB-GUARD-B',
      name: 'Database Guard B',
    });
    const supplierA = await repository.createSupplier(
      actor,
      organizationAId,
      supplierInput('Database Guard Supplier A', centerA.id, '00000000001090'),
    );
    const supplierB = await repository.createSupplier(
      actor,
      organizationBId,
      supplierInput('Database Guard Supplier B', centerB.id, '00000000001170'),
    );
    const purchaseA = await repository.createPurchase(
      actor,
      organizationAId,
      purchaseInput('DB-GUARD-A', supplierA.id, centerA.id, 10, 9),
    );
    const purchaseB = await repository.createPurchase(
      actor,
      organizationBId,
      purchaseInput('DB-GUARD-B', supplierB.id, centerB.id, 10, 9),
    );
    const ruleA = await prisma.approvalRule.create({
      data: {
        organizationId: organizationAId,
        name: 'Database Guard Approval A',
        minimumAmount: 0,
        requiredApprovals: 1,
      },
    });
    const ruleB = await prisma.approvalRule.create({
      data: {
        organizationId: organizationBId,
        name: 'Database Guard Approval B',
        minimumAmount: 0,
        requiredApprovals: 1,
      },
    });
    const itemA = await prisma.purchaseItem.findFirstOrThrow({
      where: { organizationId: organizationAId, purchaseId: purchaseA.id },
    });
    const itemB = await prisma.purchaseItem.findFirstOrThrow({
      where: { organizationId: organizationBId, purchaseId: purchaseB.id },
    });
    const integrationA = await prisma.googleSheetsIntegration.create({
      data: {
        organizationId: organizationAId,
        spreadsheetId: `db-guard-a-${suffix}`,
      },
    });
    const integrationB = await prisma.googleSheetsIntegration.create({
      data: {
        organizationId: organizationBId,
        spreadsheetId: `db-guard-b-${suffix}`,
      },
    });
    const invoiceA = await prisma.invoiceDocument.create({
      data: {
        organizationId: organizationAId,
        fileName: 'tenant-a.xml',
        mimeType: 'application/xml',
        kind: 'XML',
        storagePath: `${organizationAId}/tenant-a.xml`,
      },
    });
    const invoiceB = await prisma.invoiceDocument.create({
      data: {
        organizationId: organizationBId,
        fileName: 'tenant-b.xml',
        mimeType: 'application/xml',
        kind: 'XML',
        storagePath: `${organizationBId}/tenant-b.xml`,
      },
    });
    const installmentA = await prisma.installment.create({
      data: {
        organizationId: organizationAId,
        purchaseId: purchaseA.id,
        sequence: 1,
        dueDate: new Date('2026-12-01T00:00:00.000Z'),
        amount: 9,
      },
    });
    const installmentB = await prisma.installment.create({
      data: {
        organizationId: organizationBId,
        purchaseId: purchaseB.id,
        sequence: 1,
        dueDate: new Date('2026-12-01T00:00:00.000Z'),
        amount: 9,
      },
    });
    const paymentRuleA = await prisma.paymentApprovalRule.create({
      data: {
        organizationId: organizationAId,
        name: 'Payment Guard A',
        minimumAmount: 0,
        requiredApprovals: 1,
      },
    });
    const paymentRuleB = await prisma.paymentApprovalRule.create({
      data: {
        organizationId: organizationBId,
        name: 'Payment Guard B',
        minimumAmount: 0,
        requiredApprovals: 1,
      },
    });
    const paymentRequestA = await prisma.paymentApprovalRequest.create({
      data: {
        organizationId: organizationAId,
        purchaseId: purchaseA.id,
        ruleId: paymentRuleA.id,
        submittedById: userId,
        mode: 'PER_TITLE',
        ruleNameSnapshot: paymentRuleA.name,
        amountSnapshot: 9,
        requiredApprovals: 1,
      },
    });
    const paymentRequestB = await prisma.paymentApprovalRequest.create({
      data: {
        organizationId: organizationBId,
        purchaseId: purchaseB.id,
        ruleId: paymentRuleB.id,
        submittedById: userId,
        mode: 'PER_TITLE',
        ruleNameSnapshot: paymentRuleB.name,
        amountSnapshot: 9,
        requiredApprovals: 1,
      },
    });
    const receiptA = await prisma.goodsReceipt.create({
      data: {
        organizationId: organizationAId,
        purchaseId: purchaseA.id,
        confirmedById: userId,
        receivedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    await expectForeignKeyViolation(
      prisma.supplier.create({
        data: {
          organizationId: organizationAId,
          legalName: 'Cross-company cost center',
          defaultCostCenterId: centerB.id,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.supplierPrice.create({
        data: {
          organizationId: organizationAId,
          supplierId: supplierB.id,
          itemCode: 'CROSS-COMPANY',
          description: 'Cross-company supplier price',
          normalizedName: 'cross-company supplier price',
          negotiatedPrice: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.purchase.create({
        data: {
          organizationId: organizationAId,
          supplierId: supplierB.id,
          displaySequence: 99_999,
          number: 'CROSS-COMPANY-SUPPLIER',
          total: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.sheetSyncRun.create({
        data: {
          organizationId: organizationAId,
          integrationId: integrationB.id,
          snapshotHash: 'a'.repeat(64),
          sourceRowCount: 0,
          preview: {},
          payload: {},
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.purchaseItem.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseB.id,
          description: 'Cross-company purchase',
          unitPrice: 1,
          total: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.purchaseItem.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseA.id,
          costCenterId: centerB.id,
          description: 'Cross-company cost center',
          unitPrice: 1,
          total: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.costAllocation.create({
        data: {
          organizationId: organizationAId,
          purchaseItemId: itemB.id,
          costCenterId: centerA.id,
          percentage: 100,
          amount: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.costAllocation.create({
        data: {
          organizationId: organizationAId,
          purchaseItemId: itemA.id,
          costCenterId: centerB.id,
          percentage: 100,
          amount: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.installment.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseB.id,
          sequence: 99,
          dueDate: new Date('2026-12-01T00:00:00.000Z'),
          amount: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.invoiceDocument.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseB.id,
          fileName: 'cross-company.pdf',
          mimeType: 'application/pdf',
          kind: 'PDF',
          storagePath: `${organizationAId}/cross-company.pdf`,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.approvalRuleApprover.create({
        data: {
          organizationId: organizationAId,
          ruleId: ruleB.id,
          userId,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.purchaseApprovalRequest.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseB.id,
          ruleId: ruleA.id,
          submittedById: userId,
          ruleNameSnapshot: ruleA.name,
          notificationChannel: 'EMAIL',
          amountSnapshot: 9,
          requiredApprovals: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.purchaseStageHistory.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseB.id,
          changedById: userId,
          fromStage: 'REGISTRATION',
          toStage: 'REQUESTED',
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.purchaseInvoiceLink.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseA.id,
          invoiceDocumentId: invoiceB.id,
          matchStatus: 'MATCHED_MANUAL',
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.fiscalDocumentItem.create({
        data: {
          organizationId: organizationAId,
          invoiceDocumentId: invoiceB.id,
          sequence: 1,
          description: 'Cross-company fiscal item',
          quantity: 1,
          unitPrice: 9,
          total: 9,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.goodsReceipt.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseB.id,
          confirmedById: userId,
          receivedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.goodsReceiptItem.create({
        data: {
          organizationId: organizationAId,
          receiptId: receiptA.id,
          purchaseItemId: itemB.id,
          quantity: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.receiptResponsibility.create({
        data: {
          organizationId: organizationAId,
          userId,
          costCenterId: centerB.id,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.paymentApprovalRuleApprover.create({
        data: {
          organizationId: organizationAId,
          ruleId: paymentRuleB.id,
          userId,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.paymentApprovalRequest.create({
        data: {
          organizationId: organizationAId,
          purchaseId: purchaseB.id,
          ruleId: paymentRuleA.id,
          submittedById: userId,
          mode: 'PER_TITLE',
          ruleNameSnapshot: paymentRuleA.name,
          amountSnapshot: 9,
          requiredApprovals: 1,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.paymentApprovalParticipant.create({
        data: {
          organizationId: organizationAId,
          requestId: paymentRequestB.id,
          userId,
          nameSnapshot: actor.name,
          recipientSnapshot: actor.email,
          channel: 'EMAIL',
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.paymentApprovalTitle.create({
        data: {
          organizationId: organizationAId,
          requestId: paymentRequestA.id,
          installmentId: installmentB.id,
          amountSnapshot: 9,
          instructionFingerprint: 'a'.repeat(64),
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.paymentInstructionSnapshot.create({
        data: {
          organizationId: organizationAId,
          installmentId: installmentB.id,
          version: 1,
          paymentChannel: 'BOLETO',
          paymentReference: 'cross-company',
          fingerprint: 'b'.repeat(64),
          createdById: userId,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.paymentSettlement.create({
        data: {
          organizationId: organizationAId,
          installmentId: installmentB.id,
          amount: 1,
          paidAt: new Date('2026-08-01T00:00:00.000Z'),
          transactionId: `cross-${suffix}`,
          proofFileName: 'proof.pdf',
          proofMimeType: 'application/pdf',
          proofSize: 10,
          proofSha256: 'c'.repeat(64),
          proofStoragePath: `${organizationAId}/cross-proof.pdf`,
          createdById: userId,
        },
      }),
    );
    await expectForeignKeyViolation(
      prisma.installment.update({
        where: { id: installmentA.id },
        data: { fiscalDocumentId: invoiceB.id },
      }),
    );

    expect([integrationA.organizationId, invoiceA.organizationId]).toEqual([
      organizationAId,
      organizationAId,
    ]);
  });

  it('keeps equal business keys and operational data isolated by company', async () => {
    const centerA = await repository.createCostCenter(actor, organizationAId, {
      code: 'OPS',
      name: 'Operations A',
    });
    const centerB = await repository.createCostCenter(actor, organizationBId, {
      code: 'OPS',
      name: 'Operations B',
    });
    const supplierA = await repository.createSupplier(
      actor,
      organizationAId,
      supplierInput('Supplier A', centerA.id),
    );
    const supplierB = await repository.createSupplier(
      actor,
      organizationBId,
      supplierInput('Supplier B', centerB.id),
    );

    const purchaseA = await repository.createPurchase(
      actor,
      organizationAId,
      purchaseInput('SHARED-001', supplierA.id, centerA.id, 100, 80),
    );
    const purchaseB = await repository.createPurchase(
      actor,
      organizationBId,
      purchaseInput('SHARED-001', supplierB.id, centerB.id, 200, 150),
    );

    const [suppliersA, suppliersB, purchasesA, purchasesB, dashboardA, reportA, reportB] =
      await Promise.all([
        repository.listSuppliers(organizationAId, { search: '00000000000191' }),
        repository.listSuppliers(organizationBId, { search: '00000000000191' }),
        repository.listPurchases(organizationAId, { search: 'SHARED-001' }),
        repository.listPurchases(organizationBId, { search: 'SHARED-001' }),
        repository.getDashboardSummary(organizationAId, {
          includeUndated: true,
          supplierId: supplierA.id,
        }),
        repository.getProcurementReport(organizationAId, {
          status: 'REGISTERED',
          supplierId: supplierA.id,
        }),
        repository.getProcurementReport(organizationBId, {
          status: 'REGISTERED',
          supplierId: supplierB.id,
        }),
      ]);

    expect(suppliersA.map((supplier) => supplier.id)).toEqual([supplierA.id]);
    expect(suppliersB.map((supplier) => supplier.id)).toEqual([supplierB.id]);
    expect(purchasesA.map((purchase) => purchase.id)).toEqual([purchaseA.id]);
    expect(purchasesB.map((purchase) => purchase.id)).toEqual([purchaseB.id]);
    expect(reportA.totals.purchased).toBe(80);
    expect(reportB.totals.purchased).toBe(150);
    expect(departmentTotal(dashboardA, 'Operations A')).toBe(80);
    expect(departmentTotal(dashboardA, 'Operations B')).toBe(0);

    await expect(
      repository.createPurchase(
        actor,
        organizationAId,
        purchaseInput('CROSS-TENANT-SUPPLIER', supplierB.id, centerA.id, 10, 10),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      repository.createPurchase(
        actor,
        organizationAId,
        purchaseInput('CROSS-TENANT-CENTER', supplierA.id, centerB.id, 10, 10),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const [auditA, auditB] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          organizationId: organizationAId,
          resourceId: { in: [centerA.id, supplierA.id, purchaseA.id] },
        },
        select: { resourceId: true },
      }),
      prisma.auditLog.findMany({
        where: {
          organizationId: organizationBId,
          resourceId: { in: [centerB.id, supplierB.id, purchaseB.id] },
        },
        select: { resourceId: true },
      }),
    ]);
    expect(auditA).toHaveLength(3);
    expect(auditB).toHaveLength(3);
    expect(auditA.map((event) => event.resourceId)).not.toContain(supplierB.id);
    expect(auditB.map((event) => event.resourceId)).not.toContain(supplierA.id);
  });

  it('computes period comparisons inside the active organization and filters', async () => {
    const center = await repository.createCostCenter(actor, organizationAId, {
      code: 'COMPARE',
      name: 'Comparison Department',
    });
    const supplier = await repository.createSupplier(
      actor,
      organizationAId,
      supplierInput('Comparison Supplier', center.id, '00000000000353'),
    );

    await repository.createPurchase(
      actor,
      organizationAId,
      purchaseInput('COMPARE-PREVIOUS-001', supplier.id, center.id, 120, 100, '2026-06-15'),
    );
    await repository.createPurchase(
      actor,
      organizationAId,
      purchaseInput('COMPARE-CURRENT-001', supplier.id, center.id, 200, 150, '2026-07-15'),
    );

    const summary = await repository.getDashboardSummary(organizationAId, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      includeUndated: false,
      supplierId: supplier.id,
      costCenterId: center.id,
    });

    expect(summary.registeredPurchases).toBe(1);
    expect(summary.totalPurchased).toEqual({ value: 150, variation: 50 });
    expect(summary.negotiatedSavings).toEqual({ value: 50, variation: 150 });
  });

  it('edits, cancels and restores a purchase with tenant and audit protection', async () => {
    const center = await repository.createCostCenter(actor, organizationAId, {
      code: 'LIFE',
      name: 'Lifecycle Department',
    });
    const supplier = await repository.createSupplier(
      actor,
      organizationAId,
      supplierInput('Lifecycle Supplier', center.id, '00000000000272'),
    );
    const created = await repository.createPurchase(
      actor,
      organizationAId,
      purchaseInput(
        'LIFECYCLE-001',
        supplier.id,
        center.id,
        100,
        80,
        new Date().toISOString().slice(0, 10),
        'REGISTRATION',
      ),
    );
    const detail = await repository.getPurchase(organizationAId, created.id);

    await expect(repository.getPurchase(organizationBId, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const updated = await repository.updatePurchase(actor, organizationAId, created.id, {
      expectedUpdatedAt: detail.updatedAt,
      number: detail.number,
      invoiceNumber: null,
      supplierId: supplier.id,
      issuedAt: null,
      category: 'Lifecycle Category',
      operationNature: 'Lifecycle Update',
      paymentMethod: null,
      notes: 'Historical date pending review.',
      items: [
        {
          description: 'Updated integration item',
          quantity: 1,
          unit: 'UN',
          unitPrice: 100,
          negotiatedPrice: 75,
          costCenterId: center.id,
          allocations: [],
        },
      ],
      installments: [{ dueDate: '2026-08-16', amount: 75 }],
    });

    expect(updated.total).toBe(75);
    expect(updated.issuedAt).toBeNull();
    expect(updated.installments).toHaveLength(1);
    await prisma.installment.updateMany({
      where: { organizationId: organizationAId, purchaseId: created.id, sequence: 1 },
      data: { paidAt: new Date('2026-08-01T00:00:00.000Z') },
    });
    await expect(
      repository.updatePurchase(actor, organizationAId, created.id, {
        expectedUpdatedAt: updated.updatedAt,
        number: updated.number,
        invoiceNumber: updated.invoiceNumber,
        supplierId: updated.supplierId,
        issuedAt: updated.issuedAt,
        category: updated.category,
        operationNature: updated.operationNature,
        paymentMethod: updated.paymentMethod,
        notes: updated.notes,
        items: updated.items,
        installments: [{ dueDate: '2026-08-17', amount: 75 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const corrected = await repository.updatePurchase(actor, organizationAId, created.id, {
      expectedUpdatedAt: updated.updatedAt,
      number: updated.number,
      invoiceNumber: updated.invoiceNumber,
      supplierId: updated.supplierId,
      issuedAt: updated.issuedAt,
      category: updated.category,
      operationNature: updated.operationNature,
      paymentMethod: updated.paymentMethod,
      notes: 'Historical date reviewed without changing the paid installment.',
      items: updated.items,
      installments: updated.installments,
    });

    expect(corrected.installments[0]?.paidAt).toBe('2026-08-01');
    await expect(
      repository.updatePurchase(actor, organizationAId, created.id, {
        expectedUpdatedAt: detail.updatedAt,
        number: corrected.number,
        invoiceNumber: corrected.invoiceNumber,
        supplierId: corrected.supplierId,
        issuedAt: corrected.issuedAt,
        category: corrected.category,
        operationNature: corrected.operationNature,
        paymentMethod: corrected.paymentMethod,
        notes: corrected.notes,
        items: corrected.items,
        installments: corrected.installments,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const cancelled = await repository.changePurchaseStatus(
      actor,
      organizationAId,
      created.id,
      {
        expectedUpdatedAt: corrected.updatedAt,
        status: 'CANCELLED',
        reason: 'Duplicate lifecycle test purchase.',
      },
    );
    const excludedDashboard = await repository.getDashboardSummary(organizationAId, {
      includeUndated: true,
      supplierId: supplier.id,
    });
    const cancelledReport = await repository.getProcurementReport(organizationAId, {
      status: 'CANCELLED',
      supplierId: supplier.id,
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(excludedDashboard.registeredPurchases).toBe(0);
    expect(cancelledReport.totals.purchased).toBe(75);

    const cancelledDetail = await repository.getPurchase(organizationAId, created.id);
    const restored = await repository.changePurchaseStatus(
      actor,
      organizationAId,
      created.id,
      {
        expectedUpdatedAt: cancelledDetail.updatedAt,
        status: 'REGISTERED',
        reason: 'Cancellation reviewed and reverted.',
      },
    );
    const restoredDashboard = await repository.getDashboardSummary(organizationAId, {
      includeUndated: true,
      supplierId: supplier.id,
    });
    const purchaseAudit = await prisma.auditLog.findMany({
      where: { organizationId: organizationAId, resourceId: created.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, metadata: true, resource: true },
    });

    expect(restored.status).toBe('DRAFT');
    expect(restoredDashboard.totalPurchased.value).toBe(0);
    expect(purchaseAudit.map((event) => event.resource)).toEqual([
      'purchase',
      'purchase',
      'purchase',
      'purchase_status',
      'purchase_status',
    ]);
  });
});

function supplierInput(
  legalName: string,
  defaultCostCenterId: string,
  document = '00000000000191',
) {
  return {
    legalName,
    tradeName: null,
    document,
    category: 'Supplies',
    operationNature: 'Purchase',
    paymentMethod: null,
    defaultCostCenterId,
    email: null,
    phone: null,
    notes: null,
  };
}

function purchaseInput(
  number: string,
  supplierId: string,
  costCenterId: string,
  unitPrice: number,
  negotiatedPrice: number,
  issuedAt = new Date().toISOString().slice(0, 10),
  workflowStage: 'REGISTRATION' | 'PURCHASE_ORDER' = 'PURCHASE_ORDER',
) {
  return {
    number,
    invoiceNumber: null,
    supplierId,
    issuedAt,
    category: null,
    operationNature: null,
    paymentMethod: null,
    notes: null,
    source: 'MANUAL' as const,
    sourceReference: null,
    workflowStage,
    items: [
      {
        description: 'Integration item',
        quantity: 1,
        unit: 'UN',
        unitPrice,
        negotiatedPrice,
        costCenterId,
        allocations: [],
      },
    ],
    installments: [],
  };
}

function departmentTotal(
  dashboard: Awaited<ReturnType<PrismaProcurementRepository['getDashboardSummary']>>,
  department: string,
): number {
  return dashboard.spendByDepartment.find((entry) => entry.department === department)?.value ?? 0;
}

async function expectForeignKeyViolation(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code: 'P2003' });
}
