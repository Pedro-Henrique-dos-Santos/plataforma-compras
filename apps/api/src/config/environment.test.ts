import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('defaults local development to demo mode', () => {
    const environment = validateEnvironment({ NODE_ENV: 'development' });

    expect(environment['DEMO_MODE']).toBe('true');
    expect(environment['REQUIRE_VERIFIED_EMAIL']).toBe('false');
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
});
