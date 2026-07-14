import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestWithIdentity } from '../domain/identity.js';

export const ActiveOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithIdentity>().activeOrganization,
);

