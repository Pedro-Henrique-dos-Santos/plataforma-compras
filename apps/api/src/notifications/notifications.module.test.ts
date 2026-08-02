import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { NotificationDispatcher } from './notification-dispatcher.js';
import { NotificationWorkerService } from './notification-worker.service.js';
import { NotificationsModule } from './notifications.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ DEMO_MODE: 'true', NODE_ENV: 'test' })],
    }),
    NotificationsModule,
  ],
})
class NotificationBootstrapTestModule {}

describe('NotificationsModule', () => {
  it('resolves its providers and completes bootstrap in demo mode', async () => {
    const application = await NestFactory.createApplicationContext(
      NotificationBootstrapTestModule,
      { logger: false },
    );

    expect(application.get(NotificationDispatcher)).toBeInstanceOf(
      NotificationDispatcher,
    );
    expect(application.get(NotificationWorkerService)).toBeInstanceOf(
      NotificationWorkerService,
    );

    await application.close();
  });
});
