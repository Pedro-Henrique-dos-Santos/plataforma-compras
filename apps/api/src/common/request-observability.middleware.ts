import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const requestIdHeader = 'x-request-id';
const safeRequestId = /^[A-Za-z0-9._:-]{1,100}$/;

type RequestLogger = Pick<Logger, 'log'>;
type RequestWithId = Request & { requestId?: string };

export function requestObservabilityMiddleware(
  logger: RequestLogger = new Logger('HTTP'),
) {
  return (request: RequestWithId, response: Response, next: NextFunction): void => {
    const incomingId = request.get(requestIdHeader);
    const requestId = incomingId && safeRequestId.test(incomingId) ? incomingId : randomUUID();
    const startedAt = performance.now();
    request.requestId = requestId;
    response.setHeader(requestIdHeader, requestId);
    response.once('finish', () => {
      logger.log(
        JSON.stringify({
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          event: 'http_request',
          method: request.method,
          path: request.originalUrl.split('?')[0],
          requestId,
          statusCode: response.statusCode,
        }),
      );
    });
    next();
  };
}
