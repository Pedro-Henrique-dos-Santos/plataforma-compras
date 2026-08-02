import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

@Injectable()
export class CredentialCipher {
  private readonly key: Buffer | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const configured = config.get<string>('FISCAL_CREDENTIAL_ENCRYPTION_KEY');
    if (configured) {
      const decoded = Buffer.from(configured, 'base64');
      this.key = decoded.length === 32 ? decoded : null;
    } else if (isDemoMode(config)) {
      this.key = createHash('sha256').update('egestao-demo-fiscal-key').digest();
    } else {
      this.key = null;
    }
  }

  encrypt(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const key = this.requireKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    return Uint8Array.from(Buffer.concat([
      Buffer.from([VERSION]),
      iv,
      cipher.getAuthTag(),
      encrypted,
    ]));
  }

  decrypt(value: Uint8Array): Buffer {
    const envelope = Buffer.from(value);
    if (
      envelope.length <= 1 + IV_LENGTH + TAG_LENGTH ||
      envelope[0] !== VERSION
    ) {
      throw new ServiceUnavailableException('Credencial fiscal criptografada invalida.');
    }
    const key = this.requireKey();
    const iv = envelope.subarray(1, 1 + IV_LENGTH);
    const tag = envelope.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const encrypted = envelope.subarray(1 + IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Configure FISCAL_CREDENTIAL_ENCRYPTION_KEY com 32 bytes em base64.',
      );
    }
    return this.key;
  }
}
