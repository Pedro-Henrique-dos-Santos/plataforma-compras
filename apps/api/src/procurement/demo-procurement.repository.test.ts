import { ConflictException } from '@nestjs/common';
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

    const before = await repository.getDashboardSummary(HUMAN_CLINIC_ID);
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
    const after = await repository.getDashboardSummary(HUMAN_CLINIC_ID);

    expect(created.total).toBe(100);
    expect(created.negotiatedSavings).toBe(20);
    expect(created.departments).toEqual(['Assistencial', 'Laboratorio']);
    expect(departmentValue(after, 'Assistencial') - departmentValue(before, 'Assistencial')).toBe(60);
    expect(departmentValue(after, 'Laboratorio') - departmentValue(before, 'Laboratorio')).toBe(40);
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
