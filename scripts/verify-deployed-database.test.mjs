import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDatabaseSecuritySnapshot } from './verify-deployed-database.mjs';

const validSnapshot = {
  migrations: [
    {
      name: '202607130001_initial',
      finishedAt: new Date('2026-07-13T00:00:00.000Z'),
      rolledBackAt: null,
    },
  ],
  tableGrants: [],
  tables: [
    { name: 'organizations', rlsEnabled: true },
    { name: 'purchases', rlsEnabled: true },
  ],
};

test('accepts completed migrations, RLS and revoked browser-role grants', () => {
  assert.deepEqual(validateDatabaseSecuritySnapshot(validSnapshot), {
    migrations: 1,
    protectedTables: 2,
  });
});

test('rejects an empty or incomplete migration history', () => {
  assert.throws(
    () => validateDatabaseSecuritySnapshot({ ...validSnapshot, migrations: [] }),
    /No completed Prisma migrations/,
  );
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        migrations: [
          { name: 'rolled-back', finishedAt: null, rolledBackAt: new Date() },
        ],
      }),
    /No completed Prisma migrations/,
  );
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        migrations: [{ name: 'pending', finishedAt: null, rolledBackAt: null }],
      }),
    /Incomplete Prisma migrations/,
  );
});

test('rejects application tables without RLS', () => {
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        tables: [{ name: 'purchases', rlsEnabled: false }],
      }),
    /without RLS: purchases/,
  );
});

test('rejects direct privileges for browser database roles', () => {
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        tableGrants: [
          { grantee: 'authenticated', tableName: 'purchases', privilege: 'SELECT' },
        ],
      }),
    /authenticated:purchases:SELECT/,
  );
});

test('rejects privileges inherited through the PostgreSQL PUBLIC role', () => {
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        tableGrants: [{ grantee: 'PUBLIC', tableName: 'suppliers', privilege: 'SELECT' }],
      }),
    /PUBLIC:suppliers:SELECT/,
  );
});
