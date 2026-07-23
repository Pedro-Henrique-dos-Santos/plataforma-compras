import { randomUUID } from 'node:crypto';

import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isDemoMode } from '../config/runtime-mode.js';

@Injectable()
export class InvoiceDocumentStorage {
  private readonly demoFiles = new Map<string, Buffer>();
  private readonly bucket: string;
  private readonly client: SupabaseClient | null;
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
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<string> {
    const now = new Date();
    const path = [
      organizationId,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}-${fileName}`,
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
      throw new InternalServerErrorException('Nao foi possivel armazenar o documento fiscal.');
    }
    return path;
  }

  async read(path: string): Promise<Buffer> {
    if (this.demoMode) {
      const buffer = this.demoFiles.get(path);
      if (!buffer) {
        throw new InternalServerErrorException('Arquivo fiscal nao encontrado no armazenamento.');
      }
      return Buffer.from(buffer);
    }
    const client = this.requireClient();
    const { data, error } = await client.storage.from(this.bucket).download(path);
    if (error || !data) {
      throw new InternalServerErrorException('Arquivo fiscal nao encontrado no armazenamento.');
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(path: string): Promise<void> {
    if (this.demoMode) {
      this.demoFiles.delete(path);
      return;
    }
    const client = this.requireClient();
    await client.storage.from(this.bucket).remove([path]);
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new InternalServerErrorException('Armazenamento fiscal nao configurado.');
    }
    return this.client;
  }
}
