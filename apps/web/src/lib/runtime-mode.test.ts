import { describe, expect, it } from 'vitest';

import { parseWebDemoMode } from './runtime-mode';

describe('web runtime mode', () => {
  it('defaults to persistent mode', () => {
    expect(parseWebDemoMode(undefined)).toBe(false);
    expect(parseWebDemoMode('')).toBe(false);
    expect(parseWebDemoMode('false')).toBe(false);
  });

  it('enables demo data only when explicitly requested', () => {
    expect(parseWebDemoMode('true')).toBe(true);
    expect(() => parseWebDemoMode('invalid')).toThrow(/true or false/);
  });
});
