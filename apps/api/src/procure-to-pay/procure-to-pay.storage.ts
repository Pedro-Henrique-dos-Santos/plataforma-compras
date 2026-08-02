import { randomUUID } from 'node:crypto';

import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isDemoMode } from '../config/runtime-mode.js';

@Injectable()
export class ProcureToPayStorage {
  private readonly bucket: string;
  private readonly client: SupabaseClient | null;
  private readonly demoFiles = new Map<string, Buffer>();
  private readonly demoMode: boolean;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.demoMode = isDemoMode(config);
    this.bucket = config.get<string>('INVOICE_STORAGE_BUCKET', 'invoice-documents');
    const url = config.get<string>('SUPABASE_URL');
    const secretKey =
      config.get<string>('SUPABASE_SECRET_KEY') ??
      config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.client =
      !this.demoMode && url && secretKey
        ? createClient(url, secretKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  async save(
    organizationId: string,
    category: 'fiscal' | 'payment-advance' | 'payment-instruction' | 'payment-proof',
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<string> {
    const now = new Date();
    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-180);
    const path = [
      organizationId,
      category,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}-${safeName}`,
    ].join('/');
    if (this.demoMode) {
      this.demoFiles.set(path, Buffer.from(buffer));
      return path;
    }
    const client = this.requireClient();
    const { error } = await client.storage.from(this.bucket).upload(path, buffer, {
      cacheControl: '3600',
      contentType: mimeType,
      upsert: false,
    });
    if (error) {
      throw new InternalServerErrorException('Nao foi possivel armazenar o arquivo privado.');
    }
    return path;
  }

  async remove(path: string): Promise<void> {
    if (this.demoMode) {
      this.demoFiles.delete(path);
      return;
    }
    const client = this.requireClient();
    const { error } = await client.storage.from(this.bucket).remove([path]);
    if (error) {
      throw new InternalServerErrorException('Nao foi possivel remover o arquivo privado.');
    }
  }

  async createSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
    if (this.demoMode) {
      if (!this.demoFiles.has(path)) {
        throw new InternalServerErrorException('Arquivo privado nao encontrado.');
      }
      return `demo-private://${path}`;
    }
    const client = this.requireClient();
    const { data, error } = await client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data.signedUrl) {
      throw new InternalServerErrorException('Nao foi possivel gerar o acesso temporario.');
    }
    return data.signedUrl;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new InternalServerErrorException('Armazenamento privado nao configurado.');
    }
    return this.client;
  }
}
