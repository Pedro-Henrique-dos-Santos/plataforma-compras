import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import { EXAMPLE_COMPANY_ID, HUMAN_CLINIC_ID } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import { DemoProcurementRepository } from './demo-procurement.repository.js';

const actor: AuthenticatedIdentity = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  authUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'owner@example.com',
  name: 'Owner',
  platformRoles: ['PLATFORM_OWNER'],
};

describe('DemoProcurementRepository', () => {
  it('keeps seeded savings reconcilable from purchase item prices', async () => {
    const repository = new DemoProcurementRepository();
    const purchases = await repository.listPurchases(HUMAN_CLINIC_ID);

    for (const purchase of purchases) {
      const detail = await repository.getPurchase(HUMAN_CLINIC_ID, purchase.id);
      const itemSavings = Math.round(
        detail.items.reduce(
          (sum, item) =>
            sum + Math.max(0, item.unitPrice - (item.negotiatedPrice ?? item.unitPrice)) * item.quantity,
          0,
        ) * 100,
      ) / 100;

      expect(itemSavings).toBe(purchase.negotiatedSavings);
    }
  });

  let repository: DemoProcurementRepository;

  beforeEach(() => {
    repository = new DemoProcurementRepository();
  });

  it('keeps master data isolated by organization', async () => {
    await repository.createCostCenter(actor, HUMAN_CLINIC_ID, {
      code: 'NOVO',
      name: 'Novo departamento',
    });

    const humanCenters = await repository.listCostCenters(HUMAN_CLINIC_ID);
    const exampleCenters = await repository.listCostCenters(EXAMPLE_COMPANY_ID);

    expect(humanCenters.some((center) => center.code === 'NOVO')).toBe(true);
    expect(exampleCenters.some((center) => center.code === 'NOVO')).toBe(false);
  });

  it('updates an existing price when the same item is imported again', async () => {
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    expect(supplier).toBeDefined();
    if (!supplier) return;

    const first = await repository.importSupplierPrices(actor, HUMAN_CLINIC_ID, {
      supplierId: supplier.id,
      items: [priceItem(80)],
    });
    const second = await repository.importSupplierPrices(actor, HUMAN_CLINIC_ID, {
      supplierId: supplier.id,
      items: [priceItem(75)],
    });
    const prices = await repository.listSupplierPrices(HUMAN_CLINIC_ID, {
      supplierId: supplier.id,
      search: 'TEST-001',
    });

    expect(first).toEqual({ total: 1, created: 1, updated: 0 });
    expect(second).toEqual({ total: 1, created: 0, updated: 1 });
    expect(prices).toHaveLength(1);
    expect(prices[0]?.negotiatedPrice).toBe(75);
  });

  it('applies allocations once and exposes them in the department dashboard', async () => {
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    const centers = await repository.listCostCenters(HUMAN_CLINIC_ID);
    const assist = centers.find((center) => center.code === 'ASSIST');
    const laboratory = centers.find((center) => center.code === 'LAB');
    expect(supplier && assist && laboratory).toBeTruthy();
    if (!supplier || !assist || !laboratory) return;

    const before = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      includeUndated: true,
    });
    const created = await repository.createPurchase(actor, HUMAN_CLINIC_ID, {
      number: 'TEST-RATEIO-001',
      supplierId: supplier.id,
      issuedAt: new Date().toISOString().slice(0, 10),
      category: null,
      operationNature: null,
      paymentMethod: null,
      notes: null,
      source: 'MANUAL',
      sourceReference: null,
      items: [
        {
          description: 'Item rateado',
          quantity: 1,
          unit: 'UN',
          unitPrice: 120,
          negotiatedPrice: 100,
          costCenterId: null,
          allocations: [
            { costCenterId: assist.id, percentage: 60 },
            { costCenterId: laboratory.id, percentage: 40 },
          ],
        },
      ],
      installments: [],
    });
    const after = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      includeUndated: true,
    });

    expect(created.total).toBe(100);
    expect(created.negotiatedSavings).toBe(20);
    expect(created.departments).toEqual(['Assistencial', 'Laboratorio']);
    expect(departmentValue(after, 'Assistencial') - departmentValue(before, 'Assistencial')).toBe(60);
    expect(departmentValue(after, 'Laboratorio') - departmentValue(before, 'Laboratorio')).toBe(40);
  });

  it('combines dashboard filters and controls undated historical purchases', async () => {
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    const center = (await repository.listCostCenters(HUMAN_CLINIC_ID))[0];
    expect(supplier && center).toBeTruthy();
    if (!supplier || !center) return;

    await repository.createPurchase(actor, HUMAN_CLINIC_ID, {
      number: 'LEG-FILTER-001',
      supplierId: supplier.id,
      issuedAt: null,
      category: 'Categoria historica exclusiva',
      operationNature: null,
      paymentMethod: null,
      notes: 'Data ausente na origem.',
      source: 'GOOGLE_SHEETS',
      sourceReference: 'LEG-FILTER-001',
      items: [
        {
          description: 'Item historico',
          quantity: 1,
          unit: null,
          unitPrice: 100,
          negotiatedPrice: 80,
          costCenterId: center.id,
          allocations: [],
        },
      ],
      installments: [],
    });

    const commonFilters = {
      supplierId: supplier.id,
      costCenterId: center.id,
      category: 'Categoria historica exclusiva',
    };
    const included = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      ...commonFilters,
      includeUndated: true,
    });
    const excluded = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      ...commonFilters,
      includeUndated: false,
    });
    const datedPeriod = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      ...commonFilters,
      dateFrom: '2026-01-01',
      includeUndated: true,
    });

    expect(included.registeredPurchases).toBe(1);
    expect(included.undatedPurchases).toBe(1);
    expect(included.totalPurchased.value).toBe(80);
    expect(excluded.registeredPurchases).toBe(0);
    expect(datedPeriod.registeredPurchases).toBe(0);
  });

  it('compares a filtered dashboard range with the preceding range', async () => {
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    const center = (await repository.listCostCenters(HUMAN_CLINIC_ID))[0];
    expect(supplier && center).toBeTruthy();
    if (!supplier || !center) return;

    const commonInput = {
      supplierId: supplier.id,
      category: 'Comparativo exclusivo',
      operationNature: null,
      paymentMethod: null,
      notes: null,
      source: 'MANUAL' as const,
      sourceReference: null,
      installments: [],
    };
    await repository.createPurchase(actor, HUMAN_CLINIC_ID, {
      ...commonInput,
      number: 'COMPARE-PREVIOUS-001',
      issuedAt: '2026-06-15',
      items: [
        {
          description: 'Base anterior',
          quantity: 1,
          unit: 'UN',
          unitPrice: 150,
          negotiatedPrice: 100,
          costCenterId: center.id,
          allocations: [],
        },
      ],
    });
    await repository.createPurchase(actor, HUMAN_CLINIC_ID, {
      ...commonInput,
      number: 'COMPARE-CURRENT-001',
      issuedAt: '2026-07-15',
      items: [
        {
          description: 'Periodo atual',
          quantity: 1,
          unit: 'UN',
          unitPrice: 300,
          negotiatedPrice: 200,
          costCenterId: center.id,
          allocations: [],
        },
      ],
    });

    const summary = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      includeUndated: false,
      supplierId: supplier.id,
      costCenterId: center.id,
      category: 'Comparativo exclusivo',
    });

    expect(summary.registeredPurchases).toBe(1);
    expect(summary.totalPurchased).toEqual({ value: 200, variation: 100 });
    expect(summary.negotiatedSavings).toEqual({ value: 100, variation: 100 });
  });

  it('rejects duplicate purchase numbers', async () => {
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    expect(supplier).toBeDefined();
    if (!supplier) return;
    const input = {
      number: 'DUPLICATE-001',
      supplierId: supplier.id,
      issuedAt: new Date().toISOString().slice(0, 10),
      category: null,
      operationNature: null,
      paymentMethod: null,
      notes: null,
      source: 'MANUAL' as const,
      sourceReference: null,
      items: [
        {
          description: 'Item',
          quantity: 1,
          unit: 'UN',
          unitPrice: 10,
          negotiatedPrice: null,
          costCenterId: null,
          allocations: [],
        },
      ],
      installments: [],
    };

    await repository.createPurchase(actor, HUMAN_CLINIC_ID, input);
    await expect(repository.createPurchase(actor, HUMAN_CLINIC_ID, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('edits and cancels a purchase without leaking it to another organization', async () => {
    const supplier = (await repository.listSuppliers(HUMAN_CLINIC_ID))[0];
    const centers = await repository.listCostCenters(HUMAN_CLINIC_ID);
    const firstCenter = centers[0];
    const secondCenter = centers[1];
    expect(supplier && firstCenter && secondCenter).toBeTruthy();
    if (!supplier || !firstCenter || !secondCenter) return;

    const created = await repository.createPurchase(actor, HUMAN_CLINIC_ID, {
      number: 'EDIT-LIFECYCLE-001',
      invoiceNumber: null,
      supplierId: supplier.id,
      issuedAt: '2026-07-16',
      category: 'Categoria inicial',
      operationNature: null,
      paymentMethod: null,
      notes: null,
      source: 'MANUAL',
      sourceReference: null,
      items: [
        {
          description: 'Item inicial',
          quantity: 1,
          unit: 'UN',
          unitPrice: 100,
          negotiatedPrice: 80,
          costCenterId: firstCenter.id,
          allocations: [],
        },
      ],
      installments: [],
    });
    const detail = await repository.getPurchase(HUMAN_CLINIC_ID, created.id);
    const inactiveSupplier = (await repository.listSuppliers(HUMAN_CLINIC_ID)).find(
      (candidate) => candidate.id !== supplier.id,
    );
    const inactiveCenter = centers.find(
      (candidate) => candidate.id !== firstCenter.id && candidate.id !== secondCenter.id,
    );
    expect(inactiveSupplier && inactiveCenter).toBeTruthy();
    if (!inactiveSupplier || !inactiveCenter) return;
    await repository.updateSupplier(actor, HUMAN_CLINIC_ID, inactiveSupplier.id, {
      status: 'INACTIVE',
    });
    await repository.updateCostCenter(actor, HUMAN_CLINIC_ID, inactiveCenter.id, {
      active: false,
    });
    await expect(
      repository.updatePurchase(actor, HUMAN_CLINIC_ID, created.id, {
        expectedUpdatedAt: detail.updatedAt,
        number: detail.number,
        invoiceNumber: null,
        supplierId: inactiveSupplier.id,
        issuedAt: detail.issuedAt,
        category: detail.category,
        operationNature: detail.operationNature,
        paymentMethod: detail.paymentMethod,
        notes: detail.notes,
        items: detail.items,
        installments: detail.installments,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      repository.updatePurchase(actor, HUMAN_CLINIC_ID, created.id, {
        expectedUpdatedAt: detail.updatedAt,
        number: detail.number,
        invoiceNumber: null,
        supplierId: supplier.id,
        issuedAt: detail.issuedAt,
        category: detail.category,
        operationNature: detail.operationNature,
        paymentMethod: detail.paymentMethod,
        notes: detail.notes,
        items: [
          {
            description: 'Referencia inativa nova',
            quantity: 1,
            unit: 'UN',
            unitPrice: 80,
            negotiatedPrice: 80,
            costCenterId: inactiveCenter.id,
            allocations: [],
          },
        ],
        installments: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const updated = await repository.updatePurchase(actor, HUMAN_CLINIC_ID, created.id, {
      expectedUpdatedAt: detail.updatedAt,
      number: detail.number,
      invoiceNumber: 'NF-EDIT-001',
      supplierId: supplier.id,
      issuedAt: null,
      category: 'Categoria corrigida',
      operationNature: 'Compra de insumos',
      paymentMethod: null,
      notes: 'Data ausente na fonte historica.',
      items: [
        {
          description: 'Item corrigido',
          quantity: 1,
          unit: 'UN',
          unitPrice: 100,
          negotiatedPrice: 90,
          costCenterId: null,
          allocations: [
            { costCenterId: firstCenter.id, percentage: 50 },
            { costCenterId: secondCenter.id, percentage: 50 },
          ],
        },
      ],
      installments: [{ dueDate: '2026-08-16', amount: 90 }],
    });

    expect(updated.invoiceNumber).toBe('NF-EDIT-001');
    expect(updated.issuedAt).toBeNull();
    expect(updated.total).toBe(90);
    expect(updated.items[0]?.allocations.map((allocation) => allocation.amount)).toEqual([45, 45]);
    expect(updated.updatedAt).not.toBe(detail.updatedAt);
    await expect(
      repository.updatePurchase(actor, HUMAN_CLINIC_ID, created.id, {
        expectedUpdatedAt: detail.updatedAt,
        number: updated.number,
        invoiceNumber: updated.invoiceNumber,
        supplierId: updated.supplierId,
        issuedAt: updated.issuedAt,
        category: updated.category,
        operationNature: updated.operationNature,
        paymentMethod: updated.paymentMethod,
        notes: updated.notes,
        items: updated.items,
        installments: updated.installments,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const beforeCancellation = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      category: 'Categoria corrigida',
      includeUndated: true,
      supplierId: supplier.id,
    });
    const cancelled = await repository.changePurchaseStatus(actor, HUMAN_CLINIC_ID, created.id, {
      expectedUpdatedAt: updated.updatedAt,
      status: 'CANCELLED',
      reason: 'Pedido registrado em duplicidade.',
    });
    const afterCancellation = await repository.getDashboardSummary(HUMAN_CLINIC_ID, {
      category: 'Categoria corrigida',
      includeUndated: true,
      supplierId: supplier.id,
    });
    const cancelledReport = await repository.getProcurementReport(HUMAN_CLINIC_ID, {
      category: 'Categoria corrigida',
      status: 'CANCELLED',
      supplierId: supplier.id,
    });

    expect(beforeCancellation.registeredPurchases).toBe(1);
    expect(cancelled.status).toBe('CANCELLED');
    expect(afterCancellation.registeredPurchases).toBe(0);
    expect(cancelledReport.totals.purchased).toBe(90);
    await expect(repository.getPurchase(EXAMPLE_COMPANY_ID, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function priceItem(negotiatedPrice: number) {
  return {
    itemCode: 'TEST-001',
    description: 'Item de teste',
    unit: 'UN',
    initialPrice: 100,
    negotiatedPrice,
    validFrom: null,
    validUntil: null,
    source: 'CSV' as const,
    notes: null,
  };
}

function departmentValue(
  dashboard: Awaited<ReturnType<DemoProcurementRepository['getDashboardSummary']>>,
  department: string,
): number {
  return dashboard.spendByDepartment.find((entry) => entry.department === department)?.value ?? 0;
}
