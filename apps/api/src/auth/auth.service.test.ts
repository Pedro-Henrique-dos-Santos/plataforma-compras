import { describe, expect, it, vi } from 'vitest';

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '@compras/contracts';

import type { AuthenticatedIdentity } from '../domain/identity.js';
import { AuthService } from './auth.service.js';

const actor: AuthenticatedIdentity = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  authUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'owner@example.com',
  name: 'Nome anterior',
  termsAcceptedAt: null,
  termsVersion: null,
  privacyAcceptedAt: null,
  privacyVersion: null,
  platformRoles: ['PLATFORM_OWNER'],
};

describe('AuthService profile', () => {
  it('persists the display name and versioned legal acceptance with an audit event', async () => {
    const auditCreate = vi.fn(async () => undefined);
    const userUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      name: String(data['name']),
      termsAcceptedAt: data['termsAcceptedAt'] as Date,
      termsVersion: String(data['termsVersion']),
      privacyAcceptedAt: data['privacyAcceptedAt'] as Date,
      privacyVersion: String(data['privacyVersion']),
    }));
    const transaction = {
      user: { update: userUpdate },
      auditLog: { create: auditCreate },
    };
    const database = {
      prisma: {
        $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
        ),
      },
    };
    const config = { get: vi.fn(() => undefined) };
    const service = new AuthService(config as never, database as never);

    const updated = await service.updateProfile(
      actor,
      { name: 'Pedro Santos', acceptTerms: true, acceptPrivacy: true },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(updated).toMatchObject({
      name: 'Pedro Santos',
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
    expect(updated.termsAcceptedAt).toEqual(expect.any(String));
    expect(updated.privacyAcceptedAt).toEqual(expect.any(String));
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: actor.id,
        resource: 'user_profile',
        resourceId: actor.id,
        ipAddress: '127.0.0.1',
        metadata: expect.objectContaining({
          nameUpdated: true,
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
          userAgent: 'vitest',
        }),
      }),
    });
  });
});
