import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { MembershipStatus } from '@compras/contracts';

import { isDemoMode } from '../config/runtime-mode.js';

type ProvisioningResult = {
  authUserId: string;
  status: MembershipStatus;
};

@Injectable()
export class MemberProvisioningService {
  private readonly demoMode: boolean;
  private readonly supabase: SupabaseClient | null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.demoMode = isDemoMode(config);
    const url = config.get<string>('SUPABASE_URL');
    const serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.supabase =
      !this.demoMode && url && serviceRoleKey
        ? createClient(url, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  async invite(input: {
    email: string;
    name: string;
    organizationId: string;
    organizationName: string;
  }): Promise<ProvisioningResult> {
    if (this.demoMode) {
      return { authUserId: randomUUID(), status: 'INVITED' };
    }
    if (!this.supabase) {
      throw new ServiceUnavailableException('O servico de convites do Supabase nao esta configurado.');
    }

    const appUrl = this.config.getOrThrow<string>('APP_WEB_URL').replace(/\/$/, '');
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${appUrl}/?invitation=accepted`,
      data: {
        name: input.name,
        organization_id: input.organizationId,
        organization_name: input.organizationName,
      },
    });
    if (!error && data.user) {
      return { authUserId: data.user.id, status: 'INVITED' };
    }

    const message = error?.message.toLowerCase() ?? '';
    if (message.includes('registered') || message.includes('exist')) {
      const existing = await this.findSupabaseUser(input.email);
      if (existing) {
        return {
          authUserId: existing.id,
          status: existing.email_confirmed_at ? 'ACTIVE' : 'INVITED',
        };
      }
      throw new ConflictException('O e-mail ja existe no Supabase, mas nao pode ser vinculado.');
    }

    throw new ServiceUnavailableException(error?.message ?? 'Nao foi possivel enviar o convite.');
  }

  private async findSupabaseUser(email: string): Promise<User | null> {
    if (!this.supabase) {
      return null;
    }
    const perPage = 1_000;
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await this.supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        throw new ServiceUnavailableException('Nao foi possivel consultar usuarios do Supabase.');
      }
      const user = data.users.find(
        (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
      );
      if (user) {
        return user;
      }
      if (data.users.length < perPage) {
        break;
      }
    }
    return null;
  }
}
