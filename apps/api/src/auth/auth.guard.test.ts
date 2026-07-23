import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '@compras/contracts';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedIdentity, RequestWithIdentity } from '../domain/identity.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthService } from './auth.service.js';

const acceptedIdentity: AuthenticatedIdentity = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  authUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'buyer@example.com',
  name: 'Usuario de Teste',
  termsAcceptedAt: '2026-07-16T12:00:00.000Z',
  termsVersion: CURRENT_TERMS_VERSION,
  privacyAcceptedAt: '2026-07-16T12:00:00.000Z',
  privacyVersion: CURRENT_PRIVACY_VERSION,
  platformRoles: [],
};
const pendingIdentity: AuthenticatedIdentity = {
  ...acceptedIdentity,
  termsAcceptedAt: null,
  termsVersion: null,
  privacyAcceptedAt: null,
  privacyVersion: null,
};

describe('AuthGuard legal acceptance', () => {
  it('allows operational routes after both current documents were accepted', async () => {
    const { guard, authenticateToken } = setup(acceptedIdentity);
    const request = authenticatedRequest();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(authenticateToken).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual(acceptedIdentity);
  });

  it('blocks operational routes while legal acceptance is pending', async () => {
    const { guard } = setup(pendingIdentity);

    await expect(guard.canActivate(contextFor(authenticatedRequest()))).rejects.toMatchObject({
      response: {
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
        statusCode: 403,
      },
    });
  });

  it('allows the identity and profile endpoints to complete pending acceptance', async () => {
    const { guard } = setup(pendingIdentity, true);

    await expect(guard.canActivate(contextFor(authenticatedRequest()))).resolves.toBe(true);
  });

  it('keeps rejecting requests without a bearer token outside demo mode', async () => {
    const { guard } = setup(acceptedIdentity);

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an outdated legal document version even when acceptance has a timestamp', async () => {
    const { guard } = setup({ ...acceptedIdentity, termsVersion: 'previous-version' });

    await expect(guard.canActivate(contextFor(authenticatedRequest()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

function setup(identity: AuthenticatedIdentity, allowPendingAcceptance = false) {
  const authenticateToken = vi.fn().mockResolvedValue(identity);
  const authService = {
    authenticateToken,
    getDemoIdentity: vi.fn().mockReturnValue(identity),
    isDemoMode: false,
  } as unknown as AuthService;
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(allowPendingAcceptance),
  } as unknown as Reflector;

  return { authenticateToken, guard: new AuthGuard(authService, reflector) };
}

function authenticatedRequest(): RequestWithIdentity {
  return { headers: { authorization: 'Bearer valid-token' } } as RequestWithIdentity;
}

function contextFor(request: Pick<RequestWithIdentity, 'headers'>): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => function testHandler() {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
