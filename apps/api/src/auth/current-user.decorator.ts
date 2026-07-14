import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestWithIdentity } from '../domain/identity.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithIdentity>().user,
);

