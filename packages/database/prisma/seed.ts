import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: 'human-clinic-demo' },
    update: {},
    create: {
      name: 'Human Clinic - Demonstracao',
      slug: 'human-clinic-demo',
      document: null,
    },
  });

  await prisma.costCenter.upsert({
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
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

