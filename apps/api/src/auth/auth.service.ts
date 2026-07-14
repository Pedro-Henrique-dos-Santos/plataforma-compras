import {
  Injectable,
  Inject,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { DEMO_AUTH_USER_ID, demoUserContext } from '../demo/demo.data.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';

@Injectable()
export class AuthService {
  private readonly demoMode: boolean;
  private readonly supabase: SupabaseClient | null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const developmentDefault =
      this.config.get('NODE_ENV', 'development') !== 'production';
    this.demoMode =
      this.config.get('DEMO_MODE', String(developmentDefault)) === 'true';

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

    const emailName = data.user.email.split('@')[0] ?? data.user.email;
    const displayName =
      typeof data.user.user_metadata?.['name'] === 'string'
        ? data.user.user_metadata['name']
        : emailName;

    return {
      id: data.user.id,
      authUserId: data.user.id,
      email: data.user.email,
      name: displayName,
      platformRoles: [],
    };
  }
}
