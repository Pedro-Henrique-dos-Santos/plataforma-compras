import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminHeaders,
  cleanupFixtureDatabase,
  fixtureSummary,
  parseUiAcceptanceConfiguration,
} from './ui-acceptance-fixture.mjs';

const validEnvironment = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/compras',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test-key-with-enough-length',
  UI_ACCEPTANCE_CONFIRM: 'staging-only',
  UI_ACCEPTANCE_EMAIL: 'codex-ui-acceptance+run@example.com',
  UI_ACCEPTANCE_PASSWORD: 'Temporary-Password-123',
};

test('accepts only an explicitly confirmed synthetic staging identity', () => {
  const config = parseUiAcceptanceConfiguration(validEnvironment, 'provision');

  assert.equal(config.email, 'codex-ui-acceptance+run@example.com');
  assert.equal(config.supabaseUrl, 'https://example.supabase.co');
  assert.equal(config.password, 'Temporary-Password-123');
});

test('rejects real-looking identities and missing confirmation', () => {
  assert.throws(
    () =>
      parseUiAcceptanceConfiguration({
        ...validEnvironment,
        UI_ACCEPTANCE_EMAIL: 'compras@humanclinic.com.br',
      }),
    /reserved codex-ui-acceptance/,
  );
  assert.throws(
    () =>
      parseUiAcceptanceConfiguration({
        ...validEnvironment,
        UI_ACCEPTANCE_CONFIRM: undefined,
      }),
    /staging-only/,
  );
});

test('allows cleanup without retaining the temporary password', () => {
  const config = parseUiAcceptanceConfiguration(
    { ...validEnvironment, UI_ACCEPTANCE_PASSWORD: undefined },
    'cleanup',
  );

  assert.equal(config.password, null);
});

test('uses the correct authorization shape for Supabase secret and service-role keys', () => {
  assert.deepEqual(adminHeaders('sb_secret_example-key'), {
    apikey: 'sb_secret_example-key',
    'Content-Type': 'application/json',
  });
  assert.equal(adminHeaders('legacy-service-role-token').Authorization, 'Bearer legacy-service-role-token');
});

test('defines a reconciled dataset with dated and undated purchases', () => {
  assert.deepEqual(fixtureSummary(), {
    costCenters: 2,
    datedTotal: 168,
    negotiatedSavings: 52,
    purchases: 2,
    suppliers: 1,
    undatedTotal: 50,
  });
});

test('removes restrictive purchase relations before deleting the organization', async () => {
  const calls = [];
  const transaction = Object.fromEntries(
    ['auditLog', 'costAllocation', 'purchase', 'organization', 'user'].map((model) => [
      model,
      {
        delete: async (args) => calls.push([`${model}.delete`, args]),
        deleteMany: async (args) => calls.push([`${model}.deleteMany`, args]),
      },
    ]),
  );
  const prisma = {
    $transaction: async (operation) => operation(transaction),
  };

  await cleanupFixtureDatabase(prisma, {
    organizationId: 'organization-id',
    userId: 'user-id',
  });

  assert.deepEqual(
    calls.map(([operation]) => operation),
    [
      'auditLog.deleteMany',
      'costAllocation.deleteMany',
      'purchase.deleteMany',
      'organization.delete',
      'user.delete',
    ],
  );
});
