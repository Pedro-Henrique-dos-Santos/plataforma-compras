import type { NextFunction, Request, Response } from 'express';

export function noStoreMiddleware() {
  return (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  };
}
