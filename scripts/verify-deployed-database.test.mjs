import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_TENANT_RELATIONS,
  validateDatabaseSecuritySnapshot,
} from './verify-deployed-database.mjs';

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
  tenantRelations: REQUIRED_TENANT_RELATIONS,
};

test('accepts completed migrations, RLS, tenant relations and revoked browser-role grants', () => {
  assert.deepEqual(validateDatabaseSecuritySnapshot(validSnapshot), {
    migrations: 1,
    protectedTables: 2,
    tenantRelations: 15,
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

test('rejects a missing tenant-aware foreign key', () => {
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        tenantRelations: validSnapshot.tenantRelations.slice(1),
      }),
    /suppliers_organization_id_default_cost_center_id_fkey/,
  );
});

test('rejects a tenant foreign key with incomplete source columns', () => {
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        tenantRelations: validSnapshot.tenantRelations.map((relation, index) =>
          index === 0
            ? { ...relation, sourceColumns: ['default_cost_center_id'] }
            : relation,
        ),
      }),
    /suppliers_organization_id_default_cost_center_id_fkey/,
  );
});

test('rejects a tenant foreign key that would null the tenant column', () => {
  assert.throws(
    () =>
      validateDatabaseSecuritySnapshot({
        ...validSnapshot,
        tenantRelations: validSnapshot.tenantRelations.map((relation, index) =>
          index === 0
            ? {
                ...relation,
                deleteSetColumns: ['organization_id', 'default_cost_center_id'],
              }
            : relation,
        ),
      }),
    /suppliers_organization_id_default_cost_center_id_fkey/,
  );
});
