import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isDemoMode } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import { NotificationDispatcher } from './notification-dispatcher.js';

@Injectable()
export class NotificationWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(NotificationDispatcher)
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  async onApplicationBootstrap() {
    if (
      isDemoMode(this.config) ||
      this.config.get<string>('NOTIFICATION_WORKER_ENABLED', 'true') !== 'true'
    ) {
      return;
    }
    await this.recoverStaleDeliveries();
    const interval = Number(
      this.config.get<string>('NOTIFICATION_POLL_INTERVAL_MS', '10000'),
    );
    this.timer = setInterval(() => void this.processBatch(), interval);
    this.timer.unref();
    void this.processBatch();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processBatch() {
    if (this.processing) return;
    this.processing = true;
    try {
      for (let index = 0; index < 10; index += 1) {
        const notification = await this.claimNext();
        if (!notification) break;
        try {
          const providerMessageId = await this.dispatcher.dispatch(notification);
          await this.database.prisma.notificationOutbox.update({
            where: { id: notification.id },
            data: {
              lastError: null,
              providerMessageId,
              sentAt: new Date(),
              status: 'SENT',
            },
          });
        } catch (error) {
          const message = safeErrorMessage(error);
          const delay = Math.min(
            3_600_000,
            30_000 * 2 ** Math.max(0, notification.attempts - 1),
          );
          await this.database.prisma.notificationOutbox.update({
            where: { id: notification.id },
            data: {
              availableAt: new Date(Date.now() + delay),
              lastError: message,
              status: 'FAILED',
            },
          });
          this.logger.warn(`Notification ${notification.id} failed: ${message}`);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async claimNext() {
    return this.database.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.notificationOutbox.findFirst({
        where: {
          attempts: { lt: 5 },
          availableAt: { lte: new Date() },
          status: { in: ['PENDING', 'FAILED'] },
        },
        orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      });
      if (!candidate) return null;
      const claimed = await transaction.notificationOutbox.updateMany({
        where: { id: candidate.id, status: candidate.status },
        data: {
          attempts: { increment: 1 },
          lastError: null,
          status: 'PROCESSING',
        },
      });
      if (claimed.count !== 1) return null;
      return transaction.notificationOutbox.findUnique({
        where: { id: candidate.id },
      });
    });
  }

  private async recoverStaleDeliveries() {
    const staleBefore = new Date(Date.now() - 10 * 60_000);
    const recovered = await this.database.prisma.notificationOutbox.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
      data: {
        availableAt: new Date(),
        lastError: 'Entrega interrompida antes da confirmacao.',
        status: 'FAILED',
      },
    });
    if (recovered.count) {
      this.logger.warn(`Recovered ${recovered.count} stale notification deliveries.`);
    }
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Falha desconhecida.';
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 1_000);
}
