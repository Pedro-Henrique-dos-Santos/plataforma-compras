import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hasCurrentLegalAcceptance } from '@compras/contracts';
import { Reflector } from '@nestjs/core';

import type { RequestWithIdentity } from '../domain/identity.js';
import { AuthService } from './auth.service.js';
import { ALLOW_PENDING_LEGAL_ACCEPTANCE } from './legal-acceptance.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    const authorization = request.headers.authorization;

    if (!authorization && this.authService.isDemoMode) {
      request.user = this.authService.getDemoIdentity();
    } else {
      const [scheme, token] = authorization?.split(' ') ?? [];
      if (scheme !== 'Bearer' || !token) {
        throw new UnauthorizedException('Bearer token is required.');
      }

      request.user = await this.authService.authenticateToken(token);
    }

    const allowPendingAcceptance = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_LEGAL_ACCEPTANCE,
      [context.getHandler(), context.getClass()],
    );
    if (
      !allowPendingAcceptance &&
      !hasCurrentLegalAcceptance({
        termsAcceptedAt: request.user.termsAcceptedAt ?? null,
        termsVersion: request.user.termsVersion ?? null,
        privacyAcceptedAt: request.user.privacyAcceptedAt ?? null,
        privacyVersion: request.user.privacyVersion ?? null,
      })
    ) {
      throw new ForbiddenException({
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
        error: 'Forbidden',
        message: 'Aceite os Termos de uso e o Aviso de privacidade vigentes para continuar.',
        statusCode: 403,
      });
    }

    return true;
  }
}
