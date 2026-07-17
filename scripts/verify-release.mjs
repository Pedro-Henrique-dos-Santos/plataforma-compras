import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePaths = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'packages/contracts/package.json',
  'packages/database/package.json',
];

export function validateReleaseMetadata({ changelog, packages, releaseTag = '' }) {
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error('At least one package version is required.');
  }

  const version = packages[0]?.version;
  if (!isSemanticVersion(version)) {
    throw new Error(`Invalid semantic version: ${version ?? 'missing'}.`);
  }

  const mismatches = packages.filter((entry) => entry.version !== version);
  if (mismatches.length > 0) {
    throw new Error(
      `Workspace package versions must match ${version}: ${mismatches
        .map((entry) => `${entry.name}=${entry.version}`)
        .join(', ')}.`,
    );
  }

  const changelogHeading = new RegExp(
    `^## ${escapeRegularExpression(version)} - \\d{4}-\\d{2}-\\d{2}$`,
    'm',
  );
  if (!changelogHeading.test(changelog)) {
    throw new Error(`CHANGELOG.md must contain a dated section for ${version}.`);
  }

  if (releaseTag && releaseTag !== `v${version}`) {
    throw new Error(`Release tag ${releaseTag} must match v${version}.`);
  }

  return version;
}

async function readReleaseMetadata() {
  const packages = await Promise.all(
    packagePaths.map(async (path) => {
      const manifest = JSON.parse(await readFile(resolve(rootDirectory, path), 'utf8'));
      return { name: manifest.name ?? path, version: manifest.version };
    }),
  );
  const changelog = await readFile(resolve(rootDirectory, 'CHANGELOG.md'), 'utf8');
  return { changelog, packages, releaseTag: process.env.RELEASE_TAG?.trim() ?? '' };
}

function isSemanticVersion(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = validateReleaseMetadata(await readReleaseMetadata());
  process.stdout.write(`${JSON.stringify({ releaseTag: process.env.RELEASE_TAG ?? null, version })}\n`);
}
