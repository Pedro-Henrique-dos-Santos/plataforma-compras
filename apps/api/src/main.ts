import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { noStoreMiddleware } from './common/no-store.middleware.js';
import { requestObservabilityMiddleware } from './common/request-observability.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3333);
  const corsOrigins = config
    .get<string>(
      'CORS_ORIGIN',
      'http://localhost:5173,http://127.0.0.1:5173',
    )
    .split(',')
    .map((origin) => origin.trim());

  app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().disable('etag');
  if (config.get<string>('TRUST_PROXY', 'false') === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  app.use(helmet());
  app.use(noStoreMiddleware());
  app.use(requestObservabilityMiddleware());
  app.enableCors({
    origin: corsOrigins,
    allowedHeaders: ['Authorization', 'Content-Type', 'x-organization-id', 'x-request-id'],
    credentials: false,
    exposedHeaders: ['Content-Disposition', 'x-request-id'],
    maxAge: 600,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
