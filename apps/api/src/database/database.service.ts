import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@compras/database';

import { isDemoMode } from '../config/runtime-mode.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = isDemoMode(config) ? null : new PrismaClient();
  }

  get prisma(): PrismaClient {
    if (!this.client) {
      throw new ServiceUnavailableException('Database persistence is disabled in demo mode.');
    }
    return this.client;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async ping(): Promise<void> {
    if (!this.client) return;
    await this.client.$queryRaw`SELECT 1`;
  }

  async onModuleInit(): Promise<void> {
    await this.client?.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }
}
