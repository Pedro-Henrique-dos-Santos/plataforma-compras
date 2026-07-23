import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiGet } from './api';

describe('API cache policy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not reuse authenticated operational responses from browser cache', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await apiGet('/health/live');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/health/live'),
      expect.objectContaining({ cache: 'no-store', method: 'GET' }),
    );
  });
});
