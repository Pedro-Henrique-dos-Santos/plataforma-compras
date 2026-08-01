import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('defaults local development to demo mode', () => {
    const environment = validateEnvironment({ NODE_ENV: 'development' });

    expect(environment['DEMO_MODE']).toBe('true');
    expect(environment['REQUIRE_VERIFIED_EMAIL']).toBe('false');
    expect(environment['INVOICE_STORAGE_BUCKET']).toBe('invoice-documents');
    expect(environment['TRUST_PROXY']).toBe('false');
    expect(environment['CORS_ORIGIN']).toBe(
      'http://localhost:5173,http://127.0.0.1:5173',
    );
  });

  it('rejects an incomplete production environment', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', DEMO_MODE: 'false' }),
    ).toThrow(/Missing production environment variables/);
  });

  it('rejects demo mode and unverified identities in production', () => {
    expect(() =>
      validateEnvironment({
        DEMO_MODE: 'true',
        NODE_ENV: 'production',
      }),
    ).toThrow(/DEMO_MODE must be false/);

    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        REQUIRE_VERIFIED_EMAIL: 'false',
      }),
    ).toThrow(/REQUIRE_VERIFIED_EMAIL must be true/);
  });

  it('accepts separate Supabase credentials and an independent owner account', () => {
    const environment = validateEnvironment({
      APP_WEB_URL: 'https://compras.example.com',
      CORS_ORIGIN: 'https://compras.example.com',
      DATABASE_URL: 'postgresql://example',
      DEMO_MODE: 'false',
      NODE_ENV: 'production',
      PLATFORM_OWNER_EMAILS: 'owner@example.com',
      SUPABASE_ANON_KEY: 'anon-example',
      SUPABASE_SERVICE_ROLE_KEY: 'service-example',
      SUPABASE_URL: 'https://project.supabase.co',
    });

    expect(environment['DEMO_MODE']).toBe('false');
    expect(environment['PLATFORM_OWNER_EMAILS']).toBe('owner@example.com');
  });

  it('normalizes current Supabase publishable and secret keys', () => {
    const environment = validateEnvironment({
      APP_WEB_URL: 'https://compras.example.com',
      CORS_ORIGIN: 'https://compras.example.com',
      DATABASE_URL: 'postgresql://example',
      DEMO_MODE: 'false',
      NODE_ENV: 'production',
      PLATFORM_OWNER_EMAILS: 'owner@example.com',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      SUPABASE_SECRET_KEY: 'sb_secret_example',
      SUPABASE_URL: 'https://project.supabase.co',
    });

    expect(environment['SUPABASE_PUBLISHABLE_KEY']).toBe('sb_publishable_example');
    expect(environment['SUPABASE_SECRET_KEY']).toBe('sb_secret_example');
  });

  it('normalizes trailing slashes from configured origins', () => {
    const environment = validateEnvironment({
      APP_WEB_URL: 'https://compras.example.com/',
      CORS_ORIGIN:
        'https://compras.example.com/,https://internal.example.com/',
      DATABASE_URL: 'postgresql://example',
      DEMO_MODE: 'false',
      NODE_ENV: 'production',
      PLATFORM_OWNER_EMAILS: 'owner@example.com',
      SUPABASE_ANON_KEY: 'anon-example',
      SUPABASE_SERVICE_ROLE_KEY: 'service-example',
      SUPABASE_URL: 'https://project.supabase.co',
    });

    expect(environment['APP_WEB_URL']).toBe('https://compras.example.com');
    expect(environment['CORS_ORIGIN']).toBe(
      'https://compras.example.com,https://internal.example.com',
    );
  });

  it('rejects origins containing paths or credentials', () => {
    expect(() =>
      validateEnvironment({
        CORS_ORIGIN: 'https://user:secret@compras.example.com/api',
        NODE_ENV: 'development',
      }),
    ).toThrow(/explicit HTTP or HTTPS origins/);
  });

  it('requires the application origin in CORS for production', () => {
    expect(() =>
      validateEnvironment({
        APP_WEB_URL: 'https://compras.example.com',
        CORS_ORIGIN: 'https://outro.example.com',
        DATABASE_URL: 'postgresql://example',
        DEMO_MODE: 'false',
        NODE_ENV: 'production',
        PLATFORM_OWNER_EMAILS: 'owner@example.com',
        SUPABASE_ANON_KEY: 'anon-example',
        SUPABASE_SERVICE_ROLE_KEY: 'service-example',
        SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toThrow(/must include APP_WEB_URL/);
  });

  it('rejects every insecure CORS origin in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        CORS_ORIGIN:
          'https://compras.example.com,http://internal.example.com',
      }),
    ).toThrow(/Every CORS_ORIGIN must use HTTPS/);
  });

  it('rejects ambiguous or malformed Google service account configuration', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
        GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: 'e30=',
      }),
    ).toThrow(/only one Google service account variable/);

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"invalid"}',
      }),
    ).toThrow(/credentials are invalid/);
  });

  it('rejects an unsafe invoice storage bucket name', () => {
    expect(() =>
      validateEnvironment({
        INVOICE_STORAGE_BUCKET: '../public documents',
        NODE_ENV: 'development',
      }),
    ).toThrow(/valid private bucket name/);
  });

  it('requires a complete provider when live notifications are enabled', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        NOTIFICATION_DELIVERY_MODE: 'live',
      }),
    ).toThrow(/requires SMTP or WhatsApp/);

    const environment = validateEnvironment({
      NODE_ENV: 'development',
      NOTIFICATION_DELIVERY_MODE: 'live',
      SMTP_FROM: 'E-Gestao Compras <compras@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
    });
    expect(environment['NOTIFICATION_DELIVERY_MODE']).toBe('live');
  });

  it('limits notification provider request timeouts', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        NOTIFICATION_REQUEST_TIMEOUT_MS: '999',
      }),
    ).toThrow(/between 1000 and 120000/);

    expect(
      validateEnvironment({
        NODE_ENV: 'development',
        NOTIFICATION_REQUEST_TIMEOUT_MS: '20000',
      })['NOTIFICATION_REQUEST_TIMEOUT_MS'],
    ).toBe('20000');
  });

  it('rejects partial WhatsApp provider configuration', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        WHATSAPP_ACCESS_TOKEN: 'token-example',
      }),
    ).toThrow(/WhatsApp configuration is incomplete/);
  });
});

function productionEnvironment() {
  return {
    APP_WEB_URL: 'https://compras.example.com',
    CORS_ORIGIN: 'https://compras.example.com',
    DATABASE_URL: 'postgresql://example',
    DEMO_MODE: 'false',
    NODE_ENV: 'production',
    PLATFORM_OWNER_EMAILS: 'owner@example.com',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    SUPABASE_SECRET_KEY: 'sb_secret_example',
    SUPABASE_URL: 'https://project.supabase.co',
  };
}
