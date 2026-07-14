import { Module } from '@nestjs/common';

import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class IdentityModule {}

