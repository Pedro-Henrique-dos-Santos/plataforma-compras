import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertMetricsEquivalent,
  assertMetricsHealthy,
  parseDatabaseConnection,
  validateRestoreTarget,
} from './restore-drill.mjs';

test('parses a PostgreSQL connection without exposing credentials', () => {
  assert.deepEqual(
    parseDatabaseConnection('postgresql://user:p%40ss@localhost:5433/compras?sslmode=require'),
    {
      database: 'compras',
      hostname: 'localhost',
      password: 'p@ss',
      port: '5433',
      sslMode: 'require',
      username: 'user',
    },
  );
});

test('rejects missing and non-PostgreSQL connection strings', () => {
  assert.throws(() => parseDatabaseConnection(), /required/i);
  assert.throws(() => parseDatabaseConnection('https://example.com/database'), /PostgreSQL/i);
});

test('accepts only a separate safe local restore database', () => {
  assert.doesNotThrow(() =>
    validateRestoreTarget({
      confirmed: false,
      hostname: '127.0.0.1',
      sourceDatabase: 'compras',
      targetDatabase: 'egestao_restore_123',
    }),
  );
  assert.throws(
    () =>
      validateRestoreTarget({
        confirmed: false,
        hostname: '127.0.0.1',
        sourceDatabase: 'compras',
        targetDatabase: 'compras',
      }),
    /separate disposable/i,
  );
  assert.throws(
    () =>
      validateRestoreTarget({
        confirmed: false,
        hostname: '127.0.0.1',
        sourceDatabase: 'compras',
        targetDatabase: 'unsafe-name',
      }),
    /lowercase letters/i,
  );
});

test('requires explicit confirmation for a remote host', () => {
  assert.throws(
    () =>
      validateRestoreTarget({
        confirmed: false,
        hostname: 'db.example.invalid',
        sourceDatabase: 'compras',
        targetDatabase: 'egestao_restore_remote',
      }),
    /RESTORE_DRILL_CONFIRM=true/,
  );
});

test('validates migrations, RLS and the optional data fixture', () => {
  const metrics = healthyMetrics();
  assert.doesNotThrow(() => assertMetricsHealthy(metrics, true));
  assert.throws(
    () => assertMetricsHealthy({ ...metrics, rlsEnabledCount: 14 }),
    /preserve RLS/i,
  );
  assert.throws(
    () => assertMetricsHealthy({ ...metrics, purchases: 0 }, true),
    /fixture is incomplete/i,
  );
});

test('reports every metric that diverges after restoration', () => {
  const source = healthyMetrics();
  assert.doesNotThrow(() => assertMetricsEquivalent(source, { ...source }));
  assert.throws(
    () => assertMetricsEquivalent(source, { ...source, purchases: 2, purchaseTotal: '160.00' }),
    /purchaseTotal, purchases/,
  );
});

function healthyMetrics() {
  return {
    allocationTotal: '80.00',
    appTableCount: 15,
    appliedMigrations: ['initial', 'security', 'master-data', 'sheets', 'invoices'],
    organizations: 1,
    purchaseItems: 1,
    purchaseTotal: '80.00',
    purchases: 1,
    rlsEnabledCount: 15,
    savingsTotal: '20.00',
    suppliers: 1,
  };
}
