export function parseWebDemoMode(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('VITE_DEMO_MODE must be true or false.');
}
