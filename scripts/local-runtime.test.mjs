import assert from 'node:assert/strict';
import test from 'node:test';

import {
  persistentTargetSummary,
  prepareRuntimeEnvironment,
} from './local-runtime.mjs';

const persistentEnvironment = {
  APP_WEB_URL: 'http://localhost:5173',
  CORS_ORIGIN: 'http://localhost:5173,http://127.0.0.1:5173',
  DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/compras',
  PLATFORM_OWNER_EMAILS: 'owner@example.com',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  SUPABASE_SECRET_KEY: 'sb_secret_example',
  SUPABASE_URL: 'https://project.supabase.co',
};

test('uses persistent mode by default and shares only public Supabase values with the web', () => {
  const environment = prepareRuntimeEnvironment('persistent', persistentEnvironment);

  assert.equal(environment.DEMO_MODE, 'false');
  assert.equal(environment.VITE_DEMO_MODE, 'false');
  assert.equal(environment.VITE_SUPABASE_URL, persistentEnvironment.SUPABASE_URL);
  assert.equal(
    environment.VITE_SUPABASE_PUBLISHABLE_KEY,
    persistentEnvironment.SUPABASE_PUBLISHABLE_KEY,
  );
  assert.equal(environment.VITE_SUPABASE_SECRET_KEY, undefined);
});

test('requires an explicit command to enable non-persistent demonstration data', () => {
  const environment = prepareRuntimeEnvironment('demo');

  assert.equal(environment.DEMO_MODE, 'true');
  assert.equal(environment.VITE_DEMO_MODE, 'true');
});

test('accepts legacy public key names without exposing the server key', () => {
  const environment = prepareRuntimeEnvironment('persistent', {
    ...persistentEnvironment,
    SUPABASE_ANON_KEY: 'legacy-anon-example',
    SUPABASE_PUBLISHABLE_KEY: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
  });

  assert.equal(environment.VITE_SUPABASE_PUBLISHABLE_KEY, 'legacy-anon-example');
  assert.equal(environment.VITE_SUPABASE_SECRET_KEY, undefined);
});

test('fails before startup when persistent configuration is incomplete', () => {
  assert.throws(
    () => prepareRuntimeEnvironment('persistent', { DATABASE_URL: 'postgresql://local' }),
    /Persistent mode is not configured.*SUPABASE_URL/,
  );
});

test('prints persistence targets without credentials', () => {
  const summary = persistentTargetSummary(persistentEnvironment);

  assert.equal(summary, 'PostgreSQL db.example.com:5432; Supabase project.supabase.co');
  assert.doesNotMatch(summary, /secret/);
});
