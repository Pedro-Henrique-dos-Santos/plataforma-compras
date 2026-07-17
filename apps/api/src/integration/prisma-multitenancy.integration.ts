import { randomUUID } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
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

    expect(tables.map((table) => table.tableName)).toEqual([
      'audit_logs',
      'cost_allocations',
      'cost_centers',
      'google_sheets_integrations',
      'installments',
      'invoice_documents',
      'organization_memberships',
      'organizations',
      'platform_role_assignments',
      'purchase_items',
      'purchases',
      'sheet_sync_runs',
      'supplier_prices',
      'suppliers',
      'users',
    ]);
    expect(tables.filter((table) => !table.rlsEnabled)).toEqual([]);
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
        repository.listSuppliers(organizationAId),
        repository.listSuppliers(organizationBId),
        repository.listPurchases(organizationAId),
        repository.listPurchases(organizationBId),
        repository.getDashboardSummary(organizationAId, { includeUndated: true }),
        repository.getProcurementReport(organizationAId, { status: 'REGISTERED' }),
        repository.getProcurementReport(organizationBId, { status: 'REGISTERED' }),
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
        where: { organizationId: organizationAId },
        select: { resourceId: true },
      }),
      prisma.auditLog.findMany({
        where: { organizationId: organizationBId },
        select: { resourceId: true },
      }),
    ]);
    expect(auditA).toHaveLength(3);
    expect(auditB).toHaveLength(3);
    expect(auditA.map((event) => event.resourceId)).not.toContain(supplierB.id);
    expect(auditB.map((event) => event.resourceId)).not.toContain(supplierA.id);
  });
});

function supplierInput(legalName: string, defaultCostCenterId: string) {
  return {
    legalName,
    tradeName: null,
    document: '00000000000191',
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
) {
  return {
    number,
    invoiceNumber: null,
    supplierId,
    issuedAt: new Date().toISOString().slice(0, 10),
    category: null,
    operationNature: null,
    paymentMethod: null,
    notes: null,
    source: 'MANUAL' as const,
    sourceReference: null,
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
