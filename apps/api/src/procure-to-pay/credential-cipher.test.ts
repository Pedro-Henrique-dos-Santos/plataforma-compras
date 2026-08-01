import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { CredentialCipher } from './credential-cipher.js';

describe('fiscal credential encryption', () => {
  it('round-trips encrypted certificate data without storing plaintext', () => {
    const cipher = new CredentialCipher(
      new ConfigService({
        DEMO_MODE: 'false',
        FISCAL_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        NODE_ENV: 'test',
      }),
    );
    const plaintext = Buffer.from('certificado-e-senha');
    const encrypted = cipher.encrypt(plaintext);
    expect(Buffer.from(encrypted).includes(plaintext)).toBe(false);
    expect(cipher.decrypt(encrypted).equals(plaintext)).toBe(true);
  });

  it('rejects tampered envelopes and missing production keys', () => {
    const cipher = new CredentialCipher(
      new ConfigService({
        DEMO_MODE: 'false',
        FISCAL_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
        NODE_ENV: 'production',
      }),
    );
    const encrypted = Buffer.from(cipher.encrypt(Buffer.from('segredo')));
    const lastByteIndex = encrypted.length - 1;
    encrypted[lastByteIndex] = encrypted[lastByteIndex]! ^ 1;
    expect(() => cipher.decrypt(encrypted)).toThrow();

    const unconfigured = new CredentialCipher(
      new ConfigService({ DEMO_MODE: 'false', NODE_ENV: 'production' }),
    );
    expect(() => unconfigured.encrypt(Buffer.from('segredo'))).toThrow(
      'FISCAL_CREDENTIAL_ENCRYPTION_KEY',
    );
  });
});
