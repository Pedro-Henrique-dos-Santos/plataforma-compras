import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type {
  OrganizationRole,
  OrganizationSummary,
  Permission,
} from '@compras/contracts';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedIdentity,
  RequestWithIdentity,
} from '../domain/identity.js';
import { PermissionsGuard } from './permissions.guard.js';

const user: AuthenticatedIdentity = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  authUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'buyer@example.com',
  name: 'Usuario de Teste',
  platformRoles: [],
};

describe('PermissionsGuard', () => {
  it('allows routes that do not declare permissions', () => {
    const guard = setup(undefined);

    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('allows only the global owner to use platform permissions', () => {
    const ownerGuard = setup(['platform:manage']);
    const organizationAdminGuard = setup(['platform:manage']);

    expect(
      ownerGuard.canActivate(
        contextFor({
          user: { ...user, platformRoles: ['PLATFORM_OWNER'] },
        }),
      ),
    ).toBe(true);
    expect(() =>
      organizationAdminGuard.canActivate(
        contextFor(requestForRole('ORGANIZATION_ADMIN')),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows an organization administrator to manage the company and members', () => {
    const guard = setup(['organization:manage', 'member:manage']);

    expect(
      guard.canActivate(contextFor(requestForRole('ORGANIZATION_ADMIN'))),
    ).toBe(true);
  });

  it('allows a buyer to operate purchases but not manage members', () => {
    const purchaseGuard = setup(['purchase:read', 'purchase:write']);
    const memberGuard = setup(['member:manage']);
    const request = requestForRole('BUYER');

    expect(purchaseGuard.canActivate(contextFor(request))).toBe(true);
    expect(() => memberGuard.canActivate(contextFor(request))).toThrow(
      ForbiddenException,
    );
  });

  it('keeps report viewers on read and export permissions', () => {
    const readGuard = setup(['dashboard:read', 'purchase:read', 'report:export']);
    const writeGuard = setup(['purchase:write']);
    const request = requestForRole('REPORT_VIEWER');

    expect(readGuard.canActivate(contextFor(request))).toBe(true);
    expect(() => writeGuard.canActivate(contextFor(request))).toThrow(
      ForbiddenException,
    );
  });

  it('requires every permission declared by the route', () => {
    const guard = setup(['purchase:read', 'member:manage']);

    expect(() => guard.canActivate(contextFor(requestForRole('BUYER')))).toThrow(
      ForbiddenException,
    );
  });

  it('denies protected routes when the active organization was not resolved', () => {
    const guard = setup(['purchase:read']);

    expect(() => guard.canActivate(contextFor({ user }))).toThrow(
      ForbiddenException,
    );
  });
});

function setup(required: Permission[] | undefined): PermissionsGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

function requestForRole(role: OrganizationRole): RequestWithIdentity {
  return {
    user,
    activeOrganization: organization(role),
  } as RequestWithIdentity;
}

function organization(role: OrganizationRole): OrganizationSummary {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    name: 'Empresa de Teste',
    legalName: null,
    document: null,
    email: null,
    phone: null,
    postalCode: null,
    street: null,
    addressNumber: null,
    addressComplement: null,
    district: null,
    city: null,
    state: null,
    slug: 'empresa-de-teste',
    role,
    active: true,
  };
}

function contextFor(request: Partial<RequestWithIdentity>): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => function testHandler() {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
