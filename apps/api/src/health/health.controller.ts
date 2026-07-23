import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  live() {
    return {
      status: 'ok',
      service: 'compras-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  liveness() {
    return this.live();
  }

  @Get('ready')
  async readiness() {
    try {
      await this.database.ping();
      return {
        status: 'ready',
        service: 'compras-api',
        persistence: this.database.enabled ? 'database' : 'demo',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'compras-api',
        persistence: 'database',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
