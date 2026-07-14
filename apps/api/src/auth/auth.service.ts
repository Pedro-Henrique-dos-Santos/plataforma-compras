import {
  ConflictException,
  Injectable,
  Inject,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { configuredEmailSet, isDemoMode, readBoolean } from '../config/runtime-mode.js';
import { DatabaseService } from '../database/database.service.js';
import { DEMO_AUTH_USER_ID, demoUserContext } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';

@Injectable()
export class AuthService {
  private readonly demoMode: boolean;
  private readonly supabase: SupabaseClient | null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {
    this.demoMode = isDemoMode(this.config);

    const url = this.config.get<string>('SUPABASE_URL');
    const anonKey = this.config.get<string>('SUPABASE_ANON_KEY');
    this.supabase =
      url && anonKey
        ? createClient(url, anonKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  get isDemoMode(): boolean {
    return this.demoMode;
  }

  getDemoIdentity(): AuthenticatedIdentity {
    return {
      id: demoUserContext.id,
      authUserId: DEMO_AUTH_USER_ID,
      email: demoUserContext.email,
      name: demoUserContext.name,
      platformRoles: demoUserContext.platformRoles,
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedIdentity> {
    if (!this.supabase) {
      throw new ServiceUnavailableException('Supabase authentication is not configured.');
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user?.email) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (
      readBoolean(this.config, 'REQUIRE_VERIFIED_EMAIL', true) &&
      !data.user.email_confirmed_at
    ) {
      throw new UnauthorizedException('Confirme o e-mail antes de acessar a plataforma.');
    }

    const email = data.user.email.toLowerCase();
    const emailName = email.split('@')[0] ?? email;
    const displayName =
      typeof data.user.user_metadata?.['name'] === 'string'
        ? data.user.user_metadata['name']
        : typeof data.user.user_metadata?.['full_name'] === 'string'
          ? data.user.user_metadata['full_name']
          : emailName.length >= 2
            ? emailName
            : 'Usuario';

    return this.resolveIdentity({
      authUserId: data.user.id,
      email,
      name: displayName.trim().slice(0, 120),
    });
  }

  private async resolveIdentity(input: {
    authUserId: string;
    email: string;
    name: string;
  }): Promise<AuthenticatedIdentity> {
    const prisma = this.database.prisma;
    const platformOwnerEmails = configuredEmailSet(this.config, 'PLATFORM_OWNER_EMAILS');

    return prisma.$transaction(async (transaction) => {
      const matchingUsers = await transaction.user.findMany({
        where: { OR: [{ authUserId: input.authUserId }, { email: input.email }] },
      });
      const byAuthId = matchingUsers.find((user) => user.authUserId === input.authUserId);
      const byEmail = matchingUsers.find((user) => user.email === input.email);
      if (byAuthId && byEmail && byAuthId.id !== byEmail.id) {
        throw new ConflictException('A identidade autenticada conflita com um usuario existente.');
      }

      const existing = byAuthId ?? byEmail;
      const user = existing
        ? await transaction.user.update({
            where: { id: existing.id },
            data: {
              authUserId: input.authUserId,
              email: input.email,
              name: input.name,
            },
          })
        : await transaction.user.create({ data: input });

      if (!user.active) {
        throw new UnauthorizedException('Este usuario esta desativado.');
      }

      await transaction.organizationMembership.updateMany({
        where: { userId: user.id, status: 'INVITED' },
        data: { status: 'ACTIVE' },
      });

      if (platformOwnerEmails.has(input.email)) {
        await transaction.platformRoleAssignment.upsert({
          where: { userId_role: { userId: user.id, role: 'PLATFORM_OWNER' } },
          update: {},
          create: { userId: user.id, role: 'PLATFORM_OWNER' },
        });
      } else {
        await transaction.platformRoleAssignment.deleteMany({
          where: { userId: user.id, role: 'PLATFORM_OWNER' },
        });
      }

      const roles = await transaction.platformRoleAssignment.findMany({
        where: { userId: user.id },
        select: { role: true },
      });
      return {
        id: user.id,
        authUserId: user.authUserId,
        email: user.email,
        name: user.name,
        platformRoles: roles.map(({ role }) => role),
      };
    });
  }
}
