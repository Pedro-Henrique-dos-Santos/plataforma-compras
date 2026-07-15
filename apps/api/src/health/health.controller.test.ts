import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports demo mode as ready without a database connection', async () => {
    const database = fakeDatabase(false);
    const controller = new HealthController(database);

    await expect(controller.readiness()).resolves.toMatchObject({
      persistence: 'demo',
      status: 'ready',
    });
    expect(database.ping).toHaveBeenCalledOnce();
  });

  it('reports a database failure as unavailable', async () => {
    const database = fakeDatabase(true, new Error('offline'));
    const controller = new HealthController(database);

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function fakeDatabase(enabled: boolean, error?: Error) {
  return {
    enabled,
    ping: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseService & { ping: ReturnType<typeof vi.fn> };
}
