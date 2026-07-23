import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensurePrivateInvoiceBucket,
  parseBootstrapConfiguration,
} from './supabase-bootstrap.mjs';

const environment = {
  INVOICE_STORAGE_BUCKET: 'invoice-documents',
  SUPABASE_SECRET_KEY: 'sb_secret_key-for-unit-tests',
  SUPABASE_URL: 'https://example.supabase.co',
};

test('validates the Supabase URL, service key and bucket name', () => {
  assert.throws(() => parseBootstrapConfiguration({}), /SUPABASE_URL/);
  assert.throws(
    () => parseBootstrapConfiguration({ ...environment, SUPABASE_URL: 'http://example.com' }),
    /HTTPS/,
  );
  assert.throws(
    () => parseBootstrapConfiguration({ ...environment, INVOICE_STORAGE_BUCKET: '../unsafe' }),
    /unsupported characters/,
  );
  assert.equal(parseBootstrapConfiguration(environment).supabaseUrl, 'https://example.supabase.co');
});

test('creates a missing bucket as private and verifies it', async () => {
  const calls = [];
  const fetchImplementation = queuedFetch(
    [
      response({}, 404),
      response({ name: 'invoice-documents' }, 200),
      response({ name: 'invoice-documents', public: false }, 200),
    ],
    calls,
  );

  const result = await ensurePrivateInvoiceBucket({ environment, fetchImplementation });

  assert.deepEqual(result, { action: 'created', bucket: 'invoice-documents', private: true });
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'GET']);
  assert.deepEqual(JSON.parse(calls[1].body), {
    id: 'invoice-documents',
    name: 'invoice-documents',
    public: false,
  });
  assert.equal(calls[0].headers.apikey, environment.SUPABASE_SECRET_KEY);
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('recognizes the hosted Storage missing-bucket response', async () => {
  const calls = [];
  const fetchImplementation = queuedFetch(
    [
      response({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }, 400),
      response({ name: 'invoice-documents' }, 200),
      response({ name: 'invoice-documents', public: false }, 200),
    ],
    calls,
  );

  const result = await ensurePrivateInvoiceBucket({ environment, fetchImplementation });

  assert.equal(result.action, 'created');
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'GET']);
});

test('keeps bearer authorization only for legacy service role keys', async () => {
  const calls = [];
  const legacyEnvironment = {
    ...environment,
    SUPABASE_SECRET_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role-key-for-tests',
  };
  const fetchImplementation = queuedFetch(
    [
      response({ name: 'invoice-documents', public: false }, 200),
      response({ name: 'invoice-documents', public: false }, 200),
    ],
    calls,
  );

  await ensurePrivateInvoiceBucket({ environment: legacyEnvironment, fetchImplementation });

  assert.equal(
    calls[0].headers.Authorization,
    `Bearer ${legacyEnvironment.SUPABASE_SERVICE_ROLE_KEY}`,
  );
});

test('changes a public bucket to private before reporting success', async () => {
  const calls = [];
  const fetchImplementation = queuedFetch(
    [
      response({ name: 'invoice-documents', public: true }, 200),
      response({ message: 'Updated' }, 200),
      response({ name: 'invoice-documents', public: false }, 200),
    ],
    calls,
  );

  const result = await ensurePrivateInvoiceBucket({ environment, fetchImplementation });

  assert.equal(result.action, 'secured');
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'PUT', 'GET']);
  assert.deepEqual(JSON.parse(calls[1].body), { public: false });
});

test('rejects a bucket that remains public after provisioning', async () => {
  const fetchImplementation = queuedFetch([
    response({ name: 'invoice-documents', public: false }, 200),
    response({ name: 'invoice-documents', public: true }, 200),
  ]);

  await assert.rejects(
    ensurePrivateInvoiceBucket({ environment, fetchImplementation }),
    /still public/,
  );
});

function queuedFetch(responses, calls = []) {
  return async (url, options = {}) => {
    calls.push({
      body: options.body,
      headers: options.headers ?? {},
      method: options.method ?? 'GET',
      url,
    });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request in test.');
    return next;
  };
}

function response(body, status) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
