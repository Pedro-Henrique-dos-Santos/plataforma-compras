import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { OrganizationSummary } from '@compras/contracts';
import { describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedIdentity,
  RequestWithIdentity,
} from '../domain/identity.js';
import type { OrganizationsRepository } from '../organizations/organizations.repository.js';
import { OrganizationAccessGuard } from './organization-access.guard.js';

const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOrganizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actor: AuthenticatedIdentity = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  authUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  email: 'buyer@example.com',
  name: 'Usuario de Teste',
  platformRoles: [],
};
const organization: OrganizationSummary = {
  id: organizationId,
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
  role: 'BUYER',
  active: true,
};

describe('OrganizationAccessGuard', () => {
  it('rejects a request without an authenticated identity', async () => {
    const { guard, findAccessible } = setup();

    await expect(
      guard.canActivate(
        contextFor({
          headers: { 'x-organization-id': organizationId },
          params: {},
        } as unknown as RequestWithIdentity),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findAccessible).not.toHaveBeenCalled();
  });

  it('requires the organization header', async () => {
    const { guard, findAccessible } = setup();

    await expect(
      guard.canActivate(
        contextFor({
          headers: {},
          params: {},
          user: actor,
        } as unknown as RequestWithIdentity),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findAccessible).not.toHaveBeenCalled();
  });

  it('rejects a malformed organization identifier before querying the database', async () => {
    const { guard, findAccessible } = setup();

    await expect(
      guard.canActivate(
        contextFor({
          headers: { 'x-organization-id': 'not-a-uuid' },
          params: {},
          user: actor,
        } as unknown as RequestWithIdentity),
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'x-organization-id header must be a valid UUID.',
      },
    });
    expect(findAccessible).not.toHaveBeenCalled();
  });

  it('rejects a route that targets a different organization', async () => {
    const { guard, findAccessible } = setup();

    await expect(
      guard.canActivate(
        contextFor(requestWithOrganization(otherOrganizationId)),
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'Organization header and route must match.',
      },
    });
    expect(findAccessible).not.toHaveBeenCalled();
  });

  it('rejects an organization that is not available to the user', async () => {
    const { guard, findAccessible } = setup();
    findAccessible.mockResolvedValue(undefined);

    await expect(
      guard.canActivate(contextFor(requestWithOrganization())),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findAccessible).toHaveBeenCalledWith(actor, organizationId);
  });

  it('stores the verified organization in the active request context', async () => {
    const { guard, findAccessible } = setup();
    const request = requestWithOrganization();
    findAccessible.mockResolvedValue(organization);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.activeOrganization).toEqual(organization);
    expect(findAccessible).toHaveBeenCalledWith(actor, organizationId);
  });
});

function setup() {
  const findAccessible = vi.fn();
  const repository = { findAccessible } as unknown as OrganizationsRepository;
  return {
    findAccessible,
    guard: new OrganizationAccessGuard(repository),
  };
}

function requestWithOrganization(
  routeOrganizationId?: string,
): RequestWithIdentity {
  return {
    headers: { 'x-organization-id': organizationId },
    params: {
      ...(routeOrganizationId && { organizationId: routeOrganizationId }),
    },
    user: actor,
  } as unknown as RequestWithIdentity;
}

function contextFor(request: RequestWithIdentity): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
