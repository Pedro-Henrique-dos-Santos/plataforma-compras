export const themeModes = ['normal', 'dark', 'white'] as const;
export type ThemeMode = (typeof themeModes)[number];

export function parseThemeMode(value: string | null): ThemeMode {
  return themeModes.find((mode) => mode === value) ?? 'normal';
}
