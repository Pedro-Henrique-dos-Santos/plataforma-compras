import assert from 'node:assert/strict';
import test from 'node:test';

import { validateReleaseMetadata } from './verify-release.mjs';

const validMetadata = {
  changelog: '# Changelog\n\n## 0.9.0 - 2026-07-16\n',
  packages: [
    { name: 'root', version: '0.9.0' },
    { name: '@compras/api', version: '0.9.0' },
    { name: '@compras/web', version: '0.9.0' },
  ],
  releaseTag: 'v0.9.0',
};

test('accepts a synchronized semantic version, changelog and tag', () => {
  assert.equal(validateReleaseMetadata(validMetadata), '0.9.0');
});

test('rejects workspace packages with different versions', () => {
  assert.throws(
    () =>
      validateReleaseMetadata({
        ...validMetadata,
        packages: [
          ...validMetadata.packages,
          { name: '@compras/database', version: '0.8.1' },
        ],
      }),
    /versions must match/,
  );
});
test('rejects a tag that does not match the package version', () => {
  assert.throws(
    () => validateReleaseMetadata({ ...validMetadata, releaseTag: 'v0.9.1' }),
    /must match v0\.9\.0/,
  );
});

test('rejects a release without a dated changelog section', () => {
  assert.throws(
    () => validateReleaseMetadata({ ...validMetadata, changelog: '# Changelog\n' }),
    /dated section/,
  );
});

test('rejects versions outside the supported semantic format', () => {
  assert.throws(
    () =>
      validateReleaseMetadata({
        ...validMetadata,
        packages: [{ name: 'root', version: 'release-0.9' }],
      }),
    /Invalid semantic version/,
  );
});
