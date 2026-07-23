import { describe, expect, it, vi } from 'vitest';

import { noStoreMiddleware } from './no-store.middleware.js';

describe('noStoreMiddleware', () => {
  it('prevents authenticated business data from being stored by clients or proxies', () => {
    const setHeader = vi.fn();
    const next = vi.fn();

    noStoreMiddleware()(
      {} as never,
      { setHeader } as never,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(next).toHaveBeenCalledOnce();
  });
});
