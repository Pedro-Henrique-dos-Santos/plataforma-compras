import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  apiDockerfile,
  webDockerfile,
  nginxConfig,
  dockerIgnore,
  containersWorkflow,
  publishWorkflow,
  productionWorkflow,
] = await Promise.all([
  readFile(new URL('../apps/api/Dockerfile', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/Dockerfile', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/nginx.conf', import.meta.url), 'utf8'),
  readFile(new URL('../.dockerignore', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/containers.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/publish-images.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/supabase-production.yml', import.meta.url), 'utf8'),
]);

test('runs the API image as an unprivileged user with a health check', () => {
  assert.match(apiDockerfile, /FROM node:24-bookworm-slim AS runtime/);
  assert.match(apiDockerfile, /USER node/);
  assert.match(apiDockerfile, /api\/health\/live/);
  assert.match(apiDockerfile, /ENTRYPOINT \["\/usr\/bin\/tini", "--"\]/);
  assert.match(apiDockerfile, /node_modules\/\.prisma\/client/);
});

test('keeps privileged API credentials out of image instructions', () => {
  assert.doesNotMatch(
    apiDockerfile,
    /DATABASE_URL|GOOGLE_SERVICE_ACCOUNT|SUPABASE_SECRET|SUPABASE_SERVICE_ROLE/,
  );
});

test('verifies bundled Portuguese OCR data without network access', () => {
  assert.match(containersWorkflow, /Confirm offline Portuguese OCR data/);
  assert.match(containersWorkflow, /--network none/);
  assert.match(containersWorkflow, /resolvePortugueseOcrLanguageData/);
});

test('keeps the isolated API smoke test outside production mode', () => {
  assert.match(
    containersWorkflow,
    /--env DEMO_MODE=true\s+\\\s+--env NODE_ENV=test/,
  );
  assert.doesNotMatch(
    containersWorkflow,
    /--env DEMO_MODE=true\s+\\\s+--env NODE_ENV=production/,
  );
});

test('serves the SPA from an unprivileged web image with stable navigation', () => {
  assert.match(webDockerfile, /nginxinc\/nginx-unprivileged:stable-alpine/);
  assert.match(webDockerfile, /USER 101:101/);
  assert.match(nginxConfig, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(nginxConfig, /server_tokens off/);
  assert.match(nginxConfig, /location = \/healthz/);
});

test('excludes credentials and generated workspace content from Docker contexts', () => {
  for (const requiredPattern of ['.git', '.env.*', '**/node_modules', '**/dist', 'tmp']) {
    assert.match(dockerIgnore, new RegExp(`^${escapeRegularExpression(requiredPattern)}$`, 'm'));
  }
});

test('normalizes the GitHub owner before publishing GHCR image names', () => {
  assert.match(publishWorkflow, /\$\{GITHUB_REPOSITORY_OWNER,,\}/);
  assert.doesNotMatch(publishWorkflow, /ghcr\.io\/\$\{\{ github\.repository_owner \}\}/);
});

test('runs production migrations only from an explicit immutable tag', () => {
  assert.match(
    productionWorkflow,
    /ref: refs\/tags\/\$\{\{ inputs\.release_tag \}\}/,
  );
  assert.match(
    productionWorkflow,
    /git show-ref --verify --quiet "refs\/tags\/\$RELEASE_TAG"/,
  );
  assert.match(productionWorkflow, /test "\$\(git rev-parse HEAD\)" = "\$tag_commit"/);
  assert.match(productionWorkflow, /git merge-base --is-ancestor HEAD origin\/main/);
});

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
