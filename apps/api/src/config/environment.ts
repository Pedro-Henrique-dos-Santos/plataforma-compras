const requiredProductionKeys = [
  'APP_WEB_URL',
  'CORS_ORIGIN',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PLATFORM_OWNER_EMAILS',
] as const;

export function validateEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  const environment = { ...raw };
  const nodeEnvironment = textValue(raw['NODE_ENV']) || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test or production.');
  }

  const demoMode = booleanValue(raw['DEMO_MODE'], nodeEnvironment !== 'production');
  environment['NODE_ENV'] = nodeEnvironment;
  environment['DEMO_MODE'] = String(demoMode);
  environment['REQUIRE_VERIFIED_EMAIL'] = String(
    booleanValue(raw['REQUIRE_VERIFIED_EMAIL'], !demoMode),
  );

  const invoiceStorageBucket =
    textValue(raw['INVOICE_STORAGE_BUCKET']) || 'invoice-documents';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(invoiceStorageBucket)) {
    throw new Error('INVOICE_STORAGE_BUCKET must be a valid private bucket name.');
  }
  environment['INVOICE_STORAGE_BUCKET'] = invoiceStorageBucket;

  const corsOrigins = (textValue(raw['CORS_ORIGIN']) || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const normalizedCorsOrigins = corsOrigins.map(normalizeHttpOrigin);
  if (normalizedCorsOrigins.some((origin) => !origin)) {
    throw new Error('CORS_ORIGIN must contain explicit HTTP or HTTPS origins.');
  }
  environment['CORS_ORIGIN'] = normalizedCorsOrigins.join(',');

  const googleCredentials = textValue(raw['GOOGLE_SERVICE_ACCOUNT_JSON']);
  const encodedGoogleCredentials = textValue(raw['GOOGLE_SERVICE_ACCOUNT_JSON_BASE64']);
  if (googleCredentials && encodedGoogleCredentials) {
    throw new Error(
      'Configure only one Google service account variable: JSON or JSON_BASE64.',
    );
  }
  if (googleCredentials || encodedGoogleCredentials) {
    const credentials = parseGoogleCredentials(
      googleCredentials || Buffer.from(encodedGoogleCredentials, 'base64').toString('utf8'),
    );
    if (!credentials) {
      throw new Error('Google service account credentials are invalid.');
    }
  }

  if (!demoMode) {
    const missing = requiredProductionKeys.filter((key) => !textValue(raw[key]));
    if (missing.length) {
      throw new Error(`Missing production environment variables: ${missing.join(', ')}.`);
    }

    const appWebOrigin = normalizeHttpOrigin(textValue(raw['APP_WEB_URL']));
    if (!appWebOrigin) {
      throw new Error('APP_WEB_URL must be an explicit HTTP or HTTPS origin.');
    }
    environment['APP_WEB_URL'] = appWebOrigin;

    const ownerEmails = textValue(raw['PLATFORM_OWNER_EMAILS'])
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!ownerEmails.length || ownerEmails.some((email) => !isEmail(email))) {
      throw new Error('PLATFORM_OWNER_EMAILS must contain valid email addresses.');
    }
    environment['PLATFORM_OWNER_EMAILS'] = ownerEmails.join(',');

    if (raw['SUPABASE_ANON_KEY'] === raw['SUPABASE_SERVICE_ROLE_KEY']) {
      throw new Error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be different.');
    }
  }

  return environment;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) {
    return value.toLowerCase() === 'true';
  }
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  throw new Error('Boolean environment values must be true or false.');
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeHttpOrigin(value: string): string {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isOriginOnly = url.pathname === '/' && !url.search && !url.hash;
    return isHttp && isOriginOnly && !url.username && !url.password ? url.origin : '';
  } catch {
    return '';
  }
}

function parseGoogleCredentials(value: string): {
  client_email: string;
  private_key: string;
} | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const clientEmail = textValue(parsed['client_email']);
    const privateKey = textValue(parsed['private_key']);
    return isEmail(clientEmail) && privateKey.includes('PRIVATE KEY')
      ? { client_email: clientEmail, private_key: privateKey }
      : null;
  } catch {
    return null;
  }
}
