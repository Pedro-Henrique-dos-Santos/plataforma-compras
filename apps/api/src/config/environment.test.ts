import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('defaults local development to demo mode', () => {
    const environment = validateEnvironment({ NODE_ENV: 'development' });

    expect(environment['DEMO_MODE']).toBe('true');
    expect(environment['REQUIRE_VERIFIED_EMAIL']).toBe('false');
    expect(environment['INVOICE_STORAGE_BUCKET']).toBe('invoice-documents');
    expect(environment['TRUST_PROXY']).toBe('false');
  });

  it('rejects an incomplete production environment', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', DEMO_MODE: 'false' }),
    ).toThrow(/Missing production environment variables/);
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
      CORS_ORIGIN: 'https://compras.example.com/,http://localhost:5173/',
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
      'https://compras.example.com,http://localhost:5173',
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
});
