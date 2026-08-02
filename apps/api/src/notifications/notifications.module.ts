import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module.js';
import { NotificationDispatcher } from './notification-dispatcher.js';
import { NotificationWorkerService } from './notification-worker.service.js';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [NotificationDispatcher, NotificationWorkerService],
})
export class NotificationsModule {}
