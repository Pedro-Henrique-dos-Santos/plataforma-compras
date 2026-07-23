import { describe, expect, it } from 'vitest';

import { parseThemeMode } from './theme';

describe('parseThemeMode', () => {
  it('keeps supported themes and falls back to normal', () => {
    expect(parseThemeMode('dark')).toBe('dark');
    expect(parseThemeMode('white')).toBe('white');
    expect(parseThemeMode('unknown')).toBe('normal');
    expect(parseThemeMode(null)).toBe('normal');
  });
});
