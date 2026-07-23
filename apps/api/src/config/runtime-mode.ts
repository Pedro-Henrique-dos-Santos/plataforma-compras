import type { ConfigService } from '@nestjs/config';

export function readBoolean(
  config: ConfigService,
  key: string,
  fallback: boolean,
): boolean {
  const value = config.get<boolean | string>(key);
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return fallback;
}

export function isDemoMode(config: ConfigService): boolean {
  const developmentDefault = config.get('NODE_ENV', 'development') !== 'production';
  return readBoolean(config, 'DEMO_MODE', developmentDefault);
}

export function configuredEmailSet(config: ConfigService, key: string): Set<string> {
  return new Set(
    config
      .get<string>(key, '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}
