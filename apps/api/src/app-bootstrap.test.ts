import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { ProcureToPayModule } from './procure-to-pay/procure-to-pay.module.js';
import { ProcureToPayService } from './procure-to-pay/procure-to-pay.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ DEMO_MODE: 'true', NODE_ENV: 'test' })],
    }),
    ProcureToPayModule,
  ],
})
class ProcureToPayBootstrapTestModule {}

describe('AppModule bootstrap', () => {
  const previousDemoMode = process.env['DEMO_MODE'];
  const previousNodeEnvironment = process.env['NODE_ENV'];

  afterEach(() => {
    restoreEnvironment('DEMO_MODE', previousDemoMode);
    restoreEnvironment('NODE_ENV', previousNodeEnvironment);
  });

  it('resolves the complete dependency graph in demo mode', async () => {
    process.env['DEMO_MODE'] = 'true';
    process.env['NODE_ENV'] = 'test';

    const application = await NestFactory.createApplicationContext(
      ProcureToPayBootstrapTestModule,
      { logger: false },
    );

    expect(application.get(ProcureToPayService)).toBeInstanceOf(ProcureToPayService);
    await application.close();
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
