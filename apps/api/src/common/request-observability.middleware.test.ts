import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { requestObservabilityMiddleware } from './request-observability.middleware.js';

describe('requestObservabilityMiddleware', () => {
  it('preserves a safe request id and excludes the query string from logs', () => {
    const logger = { log: vi.fn() };
    const request = {
      get: vi.fn().mockReturnValue('trace-123'),
      method: 'GET',
      originalUrl: '/api/reports/procurement?secret=value',
    } as unknown as Request;
    const response = new EventEmitter() as EventEmitter & Partial<Response>;
    response.setHeader = vi.fn();
    response.statusCode = 200;
    const next = vi.fn() as NextFunction;

    requestObservabilityMiddleware(logger)(request, response as Response, next);
    response.emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'trace-123');
    const log = JSON.parse(logger.log.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(log).toMatchObject({
      event: 'http_request',
      path: '/api/reports/procurement',
      requestId: 'trace-123',
      statusCode: 200,
    });
    expect(JSON.stringify(log)).not.toContain('secret');
  });

  it('replaces an unsafe request id', () => {
    const request = {
      get: vi.fn().mockReturnValue('invalid\r\nheader'),
      method: 'GET',
      originalUrl: '/api/health',
    } as unknown as Request;
    const response = new EventEmitter() as EventEmitter & Partial<Response>;
    response.setHeader = vi.fn();
    response.statusCode = 200;

    requestObservabilityMiddleware({ log: vi.fn() })(
      request,
      response as Response,
      vi.fn(),
    );

    const assigned = (response.setHeader as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(assigned).toMatch(/^[0-9a-f-]{36}$/);
  });
});
