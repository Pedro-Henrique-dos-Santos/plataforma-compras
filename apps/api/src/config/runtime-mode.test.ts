import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { isDemoMode } from './runtime-mode.js';

describe('API runtime mode', () => {
  it('defaults to persistent mode', () => {
    expect(isDemoMode(new ConfigService({ NODE_ENV: 'development' }))).toBe(false);
  });

  it('enables demo repositories only when explicitly configured', () => {
    expect(isDemoMode(new ConfigService({ DEMO_MODE: 'true' }))).toBe(true);
  });
});
