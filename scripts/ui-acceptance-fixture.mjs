import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaClient } from '../packages/database/dist/index.js';

const FIXTURE_SLUG = 'codex-ui-acceptance';
const SAFE_EMAIL = /^codex-ui-acceptance(?:[+.a-z0-9_-]*)@example\.com$/i;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function parseUiAcceptanceConfiguration(environment, action = 'provision') {
  if (!['provision', 'cleanup'].includes(action)) {
    throw new Error('Action must be provision or cleanup.');
  }
  if (environment.UI_ACCEPTANCE_CONFIRM !== 'staging-only') {
    throw new Error('UI_ACCEPTANCE_CONFIRM=staging-only is required.');
  }

  const email = environment.UI_ACCEPTANCE_EMAIL?.trim().toLowerCase();
  if (!email || !SAFE_EMAIL.test(email)) {
    throw new Error('UI_ACCEPTANCE_EMAIL must use the reserved codex-ui-acceptance@example.com pattern.');
  }

  const databaseUrl = required(environment.DATABASE_URL, 'DATABASE_URL');
  const supabaseUrl = normalizedSupabaseUrl(environment.SUPABASE_URL);
  const secretKey =
    environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || secretKey.length < 20) {
    throw new Error('SUPABASE_SECRET_KEY is required.');
  }

  const password = environment.UI_ACCEPTANCE_PASSWORD;
  if (action === 'provision' && (!password || password.length < 12)) {
    throw new Error('UI_ACCEPTANCE_PASSWORD must contain at least 12 characters.');
  }

  return {
    action,
    databaseUrl,
    email,
    password: password ?? null,
    secretKey,
    supabaseUrl,
  };
}

export function adminHeaders(secretKey) {
  return {
    apikey: secretKey,
    'Content-Type': 'application/json',
    ...(secretKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${secretKey}` }),
  };
}

export function fixtureSummary() {
  return {
    costCenters: 2,
    datedTotal: 168,
    negotiatedSavings: 52,
    purchases: 2,
    suppliers: 1,
    undatedTotal: 50,
  };
}

export async function runUiAcceptanceFixture({
  action,
  environment = process.env,
  fetchImplementation = fetch,
} = {}) {
  const config = parseUiAcceptanceConfiguration(environment, action);
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });

  try {
    if (action === 'cleanup') {
      return cleanupFixture({ config, fetchImplementation, prisma });
    }
    return provisionFixture({ config, fetchImplementation, prisma });
  } finally {
    await prisma.$disconnect();
  }
}

async function provisionFixture({ config, fetchImplementation, prisma }) {
  await cleanupFixture({ config, fetchImplementation, prisma });
  const authUser = await createAuthUser(config, fetchImplementation);

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          authUserId: authUser.id,
          email: config.email,
          name: 'Usuario de Aceite Visual',
        },
      });
      const organization = await transaction.organization.create({
        data: {
          name: 'Empresa de Aceite Visual',
          slug: FIXTURE_SLUG,
          createdById: user.id,
        },
      });
      await transaction.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'ORGANIZATION_ADMIN',
          status: 'ACTIVE',
        },
      });

      const administration = await transaction.costCenter.create({
        data: {
          organizationId: organization.id,
          code: 'ADM',
          name: 'Administrativo',
        },
      });
      const operations = await transaction.costCenter.create({
        data: {
          organizationId: organization.id,
          code: 'OPE',
          name: 'Operacoes',
        },
      });
      const supplier = await transaction.supplier.create({
        data: {
          organizationId: organization.id,
          legalName: 'Fornecedor Sintetico Ltda',
          tradeName: 'Fornecedor Sintetico',
          category: 'Materiais',
          operationNature: 'Compra de materiais',
          defaultCostCenterId: administration.id,
        },
      });
      await transaction.supplierPrice.createMany({
        data: [
          {
            organizationId: organization.id,
            supplierId: supplier.id,
            itemCode: 'MAT-001',
            description: 'Material de teste A',
            normalizedName: 'material de teste a',
            unit: 'UN',
            initialPrice: 120,
            negotiatedPrice: 100,
            source: 'MANUAL',
          },
          {
            organizationId: organization.id,
            supplierId: supplier.id,
            itemCode: 'MAT-002',
            description: 'Material de teste B',
            normalizedName: 'material de teste b',
            unit: 'CX',
            initialPrice: 90,
            negotiatedPrice: 68,
            source: 'MANUAL',
          },
        ],
      });

      const datedPurchase = await transaction.purchase.create({
        data: {
          organizationId: organization.id,
          supplierId: supplier.id,
          number: 'ACEITE-001',
          invoiceNumber: 'NF-TESTE-001',
          issuedAt: new Date('2026-07-15T00:00:00.000Z'),
          category: 'Materiais',
          operationNature: 'Compra de materiais',
          total: 168,
          negotiatedSavings: 42,
          source: 'MANUAL',
          sourceReference: 'ui-acceptance-dated',
        },
      });
      const allocatedItem = await transaction.purchaseItem.create({
        data: {
          organizationId: organization.id,
          purchaseId: datedPurchase.id,
          costCenterId: administration.id,
          description: 'Material de teste A',
          quantity: 1,
          unit: 'UN',
          unitPrice: 120,
          negotiatedPrice: 100,
          total: 100,
        },
      });
      await transaction.costAllocation.createMany({
        data: [
          {
            organizationId: organization.id,
            purchaseItemId: allocatedItem.id,
            costCenterId: administration.id,
            percentage: 60,
            amount: 60,
          },
          {
            organizationId: organization.id,
            purchaseItemId: allocatedItem.id,
            costCenterId: operations.id,
            percentage: 40,
            amount: 40,
          },
        ],
      });
      await transaction.purchaseItem.create({
        data: {
          organizationId: organization.id,
          purchaseId: datedPurchase.id,
          costCenterId: operations.id,
          description: 'Material de teste B',
          quantity: 1,
          unit: 'CX',
          unitPrice: 90,
          negotiatedPrice: 68,
          total: 68,
        },
      });
      await transaction.installment.create({
        data: {
          organizationId: organization.id,
          purchaseId: datedPurchase.id,
          sequence: 1,
          dueDate: new Date('2026-08-15T00:00:00.000Z'),
          amount: 168,
        },
      });

      const undatedPurchase = await transaction.purchase.create({
        data: {
          organizationId: organization.id,
          supplierId: supplier.id,
          number: 'ACEITE-SEM-DATA',
          category: 'Materiais',
          total: 50,
          negotiatedSavings: 10,
          source: 'MANUAL',
          sourceReference: 'ui-acceptance-undated',
        },
      });
      await transaction.purchaseItem.create({
        data: {
          organizationId: organization.id,
          purchaseId: undatedPurchase.id,
          costCenterId: administration.id,
          description: 'Item historico sem data',
          quantity: 1,
          unit: 'UN',
          unitPrice: 60,
          negotiatedPrice: 50,
          total: 50,
        },
      });

      await transaction.invoiceDocument.create({
        data: {
          organizationId: organization.id,
          createdById: user.id,
          invoiceNumber: 'NF-REVISAO-001',
          fileName: 'nota-sintetica.xml',
          mimeType: 'application/xml',
          kind: 'XML',
          size: 512,
          sha256: createHash('sha256').update(`${organization.id}:invoice`).digest('hex'),
          storagePath: `${organization.id}/ui-acceptance/nota-sintetica.xml`,
          status: 'REVIEW_REQUIRED',
          parser: 'UI_ACCEPTANCE',
          confidence: 0.95,
          parsedData: {
            accessKey: null,
            category: 'Materiais',
            confidence: 0.95,
            invoiceNumber: 'NF-REVISAO-001',
            issuedAt: '2026-07-15',
            installments: [],
            items: [
              {
                description: 'Material de teste A',
                quantity: 1,
                total: 168,
                unit: 'UN',
                unitPrice: 168,
              },
            ],
            operationNature: 'Compra de materiais',
            paymentMethod: null,
            supplierDocument: null,
            supplierName: 'Fornecedor Sintetico Ltda',
            total: 168,
            triageReason: null,
            triageStatus: 'IN_SCOPE',
          },
          warnings: ['Documento sintetico para aceite visual.'],
          errors: [],
        },
      });

      return { organizationId: organization.id, userId: user.id };
    });

    return {
      action: 'provisioned',
      email: config.email,
      organizationId: result.organizationId,
      ...fixtureSummary(),
    };
  } catch (error) {
    await deleteAuthUser(config, authUser.id, fetchImplementation).catch(() => undefined);
    throw error;
  }
}

async function cleanupFixture({ config, fetchImplementation, prisma }) {
  const existingUser = await prisma.user.findUnique({ where: { email: config.email } });
  const existingOrganization = await prisma.organization.findUnique({
    where: { slug: FIXTURE_SLUG },
  });
  const authUserId =
    existingUser?.authUserId ??
    (await findAuthUserByEmail(config, fetchImplementation))?.id ??
    null;

  if (authUserId) {
    await deleteAuthUser(config, authUserId, fetchImplementation);
  }
  await cleanupFixtureDatabase(prisma, {
    organizationId: existingOrganization?.id ?? null,
    userId: existingUser?.id ?? null,
  });

  return {
    action: 'cleaned',
    email: config.email,
    organizationRemoved: Boolean(existingOrganization),
    userRemoved: Boolean(existingUser || authUserId),
  };
}

export async function cleanupFixtureDatabase(prisma, { organizationId, userId }) {
  await prisma.$transaction(async (transaction) => {
    if (userId || organizationId) {
      await transaction.auditLog.deleteMany({
        where: {
          OR: [
            ...(userId ? [{ actorUserId: userId }] : []),
            ...(organizationId ? [{ organizationId }] : []),
          ],
        },
      });
    }
    if (organizationId) {
      // These restrictive relations must be removed before the organization cascades.
      await transaction.costAllocation.deleteMany({ where: { organizationId } });
      await transaction.purchase.deleteMany({ where: { organizationId } });
      await transaction.organization.delete({ where: { id: organizationId } });
    }
    if (userId) {
      await transaction.user.delete({ where: { id: userId } });
    }
  });
}

async function createAuthUser(config, fetchImplementation) {
  const response = await fetchImplementation(`${config.supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(config.secretKey),
    body: JSON.stringify({
      email: config.email,
      password: config.password,
      email_confirm: true,
      user_metadata: { name: 'Usuario de Aceite Visual' },
    }),
  });
  return readSuccessfulJson(response, 'create the acceptance user');
}

async function findAuthUserByEmail(config, fetchImplementation) {
  const response = await fetchImplementation(
    `${config.supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    { headers: adminHeaders(config.secretKey) },
  );
  const result = await readSuccessfulJson(response, 'list acceptance users');
  const users = Array.isArray(result) ? result : result.users;
  return users?.find((user) => user.email?.toLowerCase() === config.email) ?? null;
}

async function deleteAuthUser(config, userId, fetchImplementation) {
  const response = await fetchImplementation(
    `${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE', headers: adminHeaders(config.secretKey) },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not delete the acceptance user. Supabase Auth returned HTTP ${response.status}.`);
  }
}

async function readSuccessfulJson(response, operation) {
  if (!response.ok) {
    throw new Error(`Could not ${operation}. Supabase Auth returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`Could not ${operation}. Supabase Auth returned invalid JSON.`);
  }
}

function required(value, name) {
  if (!value?.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function normalizedSupabaseUrl(rawUrl) {
  const value = required(rawUrl, 'SUPABASE_URL');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SUPABASE_URL is invalid.');
  }
  const localHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('SUPABASE_URL must use HTTPS outside local development.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('SUPABASE_URL must not contain credentials, query parameters or fragments.');
  }
  return url.href.replace(/\/$/, '');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const action = process.argv[2] ?? 'provision';
  const result = await runUiAcceptanceFixture({ action });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
