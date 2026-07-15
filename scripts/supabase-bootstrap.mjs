import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SAFE_BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{2,62}$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export async function ensurePrivateInvoiceBucket({
  environment = process.env,
  fetchImplementation = fetch,
} = {}) {
  const config = parseBootstrapConfiguration(environment);
  const bucketUrl = `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  const headers = {
    apikey: config.secretKey,
    'Content-Type': 'application/json',
  };
  if (!config.secretKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${config.secretKey}`;
  }
  let action = 'verified';
  let response = await fetchImplementation(bucketUrl, { headers });

  if (await isMissingBucketResponse(response)) {
    response = await fetchImplementation(`${config.supabaseUrl}/storage/v1/bucket`, {
      body: JSON.stringify({ id: config.bucket, name: config.bucket, public: false }),
      headers,
      method: 'POST',
    });
    assertSuccessfulResponse(response, 'create the private invoice bucket');
    action = 'created';
  } else {
    assertSuccessfulResponse(response, 'read the invoice bucket');
    const bucket = await readJson(response, 'read the invoice bucket');
    if (bucket.public !== false) {
      response = await fetchImplementation(bucketUrl, {
        body: JSON.stringify({ public: false }),
        headers,
        method: 'PUT',
      });
      assertSuccessfulResponse(response, 'make the invoice bucket private');
      action = 'secured';
    }
  }

  const verification = await fetchImplementation(bucketUrl, { headers });
  assertSuccessfulResponse(verification, 'verify the invoice bucket');
  const verifiedBucket = await readJson(verification, 'verify the invoice bucket');
  if (verifiedBucket.public !== false) {
    throw new Error('Supabase returned an invoice bucket that is still public.');
  }

  return { action, bucket: config.bucket, private: true };
}

export function parseBootstrapConfiguration(environment) {
  const rawUrl = environment.SUPABASE_URL;
  const secretKey =
    environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = environment.INVOICE_STORAGE_BUCKET ?? 'invoice-documents';
  if (!rawUrl) throw new Error('SUPABASE_URL is required.');
  if (!secretKey || secretKey.length < 20) {
    throw new Error('SUPABASE_SECRET_KEY is required.');
  }

  let url;
  try {
    url = new URL(rawUrl);
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
  if (!SAFE_BUCKET_NAME.test(bucket) || bucket.includes('..')) {
    throw new Error('INVOICE_STORAGE_BUCKET contains unsupported characters.');
  }

  return {
    bucket,
    secretKey,
    supabaseUrl: url.href.replace(/\/$/, ''),
  };
}

async function isMissingBucketResponse(response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const body = await response.clone().json();
    return String(body?.statusCode) === '404' && body?.message === 'Bucket not found';
  } catch {
    return false;
  }
}

function assertSuccessfulResponse(response, operation) {
  if (!response.ok) {
    throw new Error(`Could not ${operation}. Supabase Storage returned HTTP ${response.status}.`);
  }
}

async function readJson(response, operation) {
  try {
    return await response.json();
  } catch {
    throw new Error(`Could not ${operation}. Supabase Storage returned invalid JSON.`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await ensurePrivateInvoiceBucket();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
