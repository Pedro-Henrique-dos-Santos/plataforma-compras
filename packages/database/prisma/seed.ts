import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: 'e-gestao-demo' },
    update: { name: 'E-Gestao - Demonstracao' },
    create: {
      name: 'E-Gestao - Demonstracao',
      slug: 'e-gestao-demo',
      document: null,
    },
  });

  const costCenter = await prisma.costCenter.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: 'ADMIN',
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      code: 'ADMIN',
      name: 'Administrativo',
    },
  });

  const existingSupplier = await prisma.supplier.findFirst({
    where: {
      organizationId: organization.id,
      legalName: 'Fornecedor demonstrativo',
    },
  });
  const supplier = existingSupplier
    ? await prisma.supplier.update({
        where: { id: existingSupplier.id },
        data: { defaultCostCenterId: costCenter.id, status: 'ACTIVE' },
      })
    : await prisma.supplier.create({
        data: {
          organizationId: organization.id,
          legalName: 'Fornecedor demonstrativo',
          tradeName: 'Fornecedor Demo',
          category: 'Materiais de escritorio',
          operationNature: 'Compra de materiais',
          defaultCostCenterId: costCenter.id,
        },
      });

  await prisma.supplierPrice.upsert({
    where: {
      organizationId_supplierId_itemCode: {
        organizationId: organization.id,
        supplierId: supplier.id,
        itemCode: 'DEMO-001',
      },
    },
    update: {
      initialPrice: 100,
      negotiatedPrice: 80,
      status: 'ACTIVE',
    },
    create: {
      organizationId: organization.id,
      supplierId: supplier.id,
      itemCode: 'DEMO-001',
      description: 'Item demonstrativo',
      normalizedName: 'item demonstrativo',
      unit: 'UN',
      initialPrice: 100,
      negotiatedPrice: 80,
      source: 'MANUAL',
    },
  });

  await prisma.purchase.upsert({
    where: {
      organizationId_number: {
        organizationId: organization.id,
        number: 'DEMO-001',
      },
    },
    update: {
      supplierId: supplier.id,
      total: 80,
      negotiatedSavings: 20,
    },
    create: {
      organizationId: organization.id,
      supplierId: supplier.id,
      number: 'DEMO-001',
      issuedAt: new Date('2026-01-15T00:00:00.000Z'),
      category: 'Materiais de escritorio',
      operationNature: 'Compra de materiais',
      total: 80,
      negotiatedSavings: 20,
      source: 'MANUAL',
      sourceReference: 'development-seed-demo-001',
      items: {
        create: {
          organizationId: organization.id,
          description: 'Item demonstrativo',
          quantity: 1,
          unit: 'UN',
          unitPrice: 100,
          negotiatedPrice: 80,
          total: 80,
          allocations: {
            create: {
              organizationId: organization.id,
              costCenterId: costCenter.id,
              percentage: 100,
              amount: 80,
            },
          },
        },
      },
      installments: {
        create: {
          organizationId: organization.id,
          sequence: 1,
          dueDate: new Date('2026-02-15T00:00:00.000Z'),
          amount: 80,
        },
      },
    },
  });

  const integration = await prisma.googleSheetsIntegration.upsert({
    where: { organizationId: organization.id },
    update: { enabled: true },
    create: {
      organizationId: organization.id,
      spreadsheetId: 'development-demo-spreadsheet',
      spreadsheetTitle: 'Planilha demonstrativa',
    },
  });

  const existingRun = await prisma.sheetSyncRun.findFirst({
    where: {
      organizationId: organization.id,
      integrationId: integration.id,
      snapshotHash: '0000000000000000000000000000000000000000000000000000000000000000',
    },
  });
  if (!existingRun) {
    await prisma.sheetSyncRun.create({
      data: {
        organizationId: organization.id,
        integrationId: integration.id,
        status: 'APPLIED',
        snapshotHash: '0000000000000000000000000000000000000000000000000000000000000000',
        sourceRowCount: 1,
        preview: { source: 'development-seed' },
        payload: { source: 'development-seed' },
        result: { created: 1 },
        appliedAt: new Date('2026-01-15T00:00:00.000Z'),
      },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
