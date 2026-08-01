const requiredProductionKeys = [
  'APP_WEB_URL',
  'CORS_ORIGIN',
  'DATABASE_URL',
  'SUPABASE_URL',
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
  const requireVerifiedEmail = booleanValue(
    raw['REQUIRE_VERIFIED_EMAIL'],
    !demoMode,
  );
  environment['REQUIRE_VERIFIED_EMAIL'] = String(requireVerifiedEmail);
  environment['TRUST_PROXY'] = String(booleanValue(raw['TRUST_PROXY'], false));
  environment['NOTIFICATION_WORKER_ENABLED'] = String(
    booleanValue(raw['NOTIFICATION_WORKER_ENABLED'], true),
  );
  const notificationMode =
    textValue(raw['NOTIFICATION_DELIVERY_MODE']).toLowerCase() || 'log';
  if (!['log', 'live'].includes(notificationMode)) {
    throw new Error('NOTIFICATION_DELIVERY_MODE must be log or live.');
  }
  environment['NOTIFICATION_DELIVERY_MODE'] = notificationMode;
  const notificationPollInterval = numberValue(
    raw['NOTIFICATION_POLL_INTERVAL_MS'],
    10_000,
  );
  if (notificationPollInterval < 1_000 || notificationPollInterval > 300_000) {
    throw new Error(
      'NOTIFICATION_POLL_INTERVAL_MS must be between 1000 and 300000.',
    );
  }
  environment['NOTIFICATION_POLL_INTERVAL_MS'] = String(
    notificationPollInterval,
  );
  const notificationRequestTimeout = numberValue(
    raw['NOTIFICATION_REQUEST_TIMEOUT_MS'],
    15_000,
  );
  if (
    notificationRequestTimeout < 1_000 ||
    notificationRequestTimeout > 120_000
  ) {
    throw new Error(
      'NOTIFICATION_REQUEST_TIMEOUT_MS must be between 1000 and 120000.',
    );
  }
  environment['NOTIFICATION_REQUEST_TIMEOUT_MS'] = String(
    notificationRequestTimeout,
  );
  environment['SMTP_SECURE'] = String(booleanValue(raw['SMTP_SECURE'], false));
  validateNotificationProviders(raw, notificationMode);
  if (nodeEnvironment === 'production' && demoMode) {
    throw new Error('DEMO_MODE must be false in production.');
  }
  if (nodeEnvironment === 'production' && !requireVerifiedEmail) {
    throw new Error('REQUIRE_VERIFIED_EMAIL must be true in production.');
  }

  const invoiceStorageBucket =
    textValue(raw['INVOICE_STORAGE_BUCKET']) || 'invoice-documents';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(invoiceStorageBucket)) {
    throw new Error('INVOICE_STORAGE_BUCKET must be a valid private bucket name.');
  }
  environment['INVOICE_STORAGE_BUCKET'] = invoiceStorageBucket;

  const corsOrigins =
    (
      textValue(raw['CORS_ORIGIN']) ||
      'http://localhost:5173,http://127.0.0.1:5173'
    )
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
    const supabasePublishableKey =
      textValue(raw['SUPABASE_PUBLISHABLE_KEY']) || textValue(raw['SUPABASE_ANON_KEY']);
    const supabaseSecretKey =
      textValue(raw['SUPABASE_SECRET_KEY']) || textValue(raw['SUPABASE_SERVICE_ROLE_KEY']);
    const missing: string[] = requiredProductionKeys.filter((key) => !textValue(raw[key]));
    if (!supabasePublishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
    if (!supabaseSecretKey) missing.push('SUPABASE_SECRET_KEY');
    if (missing.length) {
      throw new Error(`Missing production environment variables: ${missing.join(', ')}.`);
    }
    environment['SUPABASE_PUBLISHABLE_KEY'] = supabasePublishableKey;
    environment['SUPABASE_SECRET_KEY'] = supabaseSecretKey;

    const appWebOrigin = normalizeHttpOrigin(textValue(raw['APP_WEB_URL']));
    if (!appWebOrigin) {
      throw new Error('APP_WEB_URL must be an explicit HTTP or HTTPS origin.');
    }
    environment['APP_WEB_URL'] = appWebOrigin;
    if (nodeEnvironment === 'production' && !appWebOrigin.startsWith('https://')) {
      throw new Error('APP_WEB_URL must use HTTPS in production.');
    }
    if (!normalizedCorsOrigins.includes(appWebOrigin)) {
      throw new Error('CORS_ORIGIN must include APP_WEB_URL.');
    }
    if (
      nodeEnvironment === 'production' &&
      normalizedCorsOrigins.some((origin) => !origin.startsWith('https://'))
    ) {
      throw new Error('Every CORS_ORIGIN must use HTTPS in production.');
    }

    const supabaseOrigin = normalizeHttpOrigin(textValue(raw['SUPABASE_URL']));
    if (!supabaseOrigin?.startsWith('https://')) {
      throw new Error('SUPABASE_URL must be a valid HTTPS origin.');
    }
    environment['SUPABASE_URL'] = supabaseOrigin;

    const databaseUrl = textValue(raw['DATABASE_URL']);
    if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
      throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
    }

    const ownerEmails = textValue(raw['PLATFORM_OWNER_EMAILS'])
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!ownerEmails.length || ownerEmails.some((email) => !isEmail(email))) {
      throw new Error('PLATFORM_OWNER_EMAILS must contain valid email addresses.');
    }
    environment['PLATFORM_OWNER_EMAILS'] = ownerEmails.join(',');

    if (supabasePublishableKey === supabaseSecretKey) {
      throw new Error('Supabase publishable and secret keys must be different.');
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

function numberValue(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error('Numeric environment values must be integers.');
  }
  return parsed;
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

function validateNotificationProviders(
  raw: Record<string, unknown>,
  mode: string,
) {
  const smtpHost = textValue(raw['SMTP_HOST']);
  const smtpPort = textValue(raw['SMTP_PORT']);
  const smtpFrom = textValue(raw['SMTP_FROM']);
  const smtpUser = textValue(raw['SMTP_USER']);
  const smtpPassword = textValue(raw['SMTP_PASSWORD']);
  const anySmtp = Boolean(smtpHost || smtpFrom || smtpUser || smtpPassword);
  if (anySmtp) {
    const port = Number(smtpPort);
    if (!smtpHost || !smtpFrom || !Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('SMTP_HOST, SMTP_PORT and SMTP_FROM must be valid.');
    }
    if (!isEmailAddressFrom(smtpFrom)) {
      throw new Error('SMTP_FROM must contain a valid email address.');
    }
    if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
      throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
    }
  }

  const whatsappKeys = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_APPROVAL_TEMPLATE',
    'WHATSAPP_REJECTION_TEMPLATE',
    'WHATSAPP_FINANCE_TEMPLATE',
  ] as const;
  const configuredWhatsApp = whatsappKeys.filter((key) => textValue(raw[key]));
  if (
    configuredWhatsApp.length > 0 &&
    configuredWhatsApp.length !== whatsappKeys.length
  ) {
    throw new Error(
      `WhatsApp configuration is incomplete: ${whatsappKeys
        .filter((key) => !textValue(raw[key]))
        .join(', ')}.`,
    );
  }
  if (mode === 'live' && !anySmtp && configuredWhatsApp.length === 0) {
    throw new Error(
      'Live notification delivery requires SMTP or WhatsApp configuration.',
    );
  }
}

function isEmailAddressFrom(value: string): boolean {
  const bracketMatch = value.match(/<([^>]+)>/);
  return isEmail((bracketMatch?.[1] ?? value).trim());
}
