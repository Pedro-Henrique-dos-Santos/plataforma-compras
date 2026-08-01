import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';
import { ProcureToPayService } from './procure-to-pay.service.js';

@Injectable()
export class FiscalSyncWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FiscalSyncWorkerService.name);
  private processing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ProcureToPayService) private readonly service: ProcureToPayService,
  ) {}

  onApplicationBootstrap() {
    if (
      isDemoMode(this.config) ||
      this.config.get<string>('FISCAL_SYNC_WORKER_ENABLED', 'false') !== 'true'
    ) {
      return;
    }
    const interval = Number(
      this.config.get<string>('FISCAL_SYNC_POLL_INTERVAL_MS', '60000'),
    );
    this.timer = setInterval(() => void this.processBatch(), interval);
    this.timer.unref();
    void this.processBatch();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processBatch(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.service.syncDueFiscalOrganizations();
    } catch (error) {
      this.logger.warn(
        `Fiscal synchronization batch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.processing = false;
    }
  }
}
