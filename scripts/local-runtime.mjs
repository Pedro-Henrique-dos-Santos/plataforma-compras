import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const persistentCommands = new Set(['persistent', 'check', 'setup']);

export function prepareRuntimeEnvironment(
  mode,
  fileEnvironment = {},
  externalEnvironment = {},
) {
  const environment = { ...fileEnvironment, ...externalEnvironment };
  environment.NODE_ENV ||= 'development';
  environment.VITE_API_URL ||= '/api';

  if (mode === 'demo') {
    environment.DEMO_MODE = 'true';
    environment.VITE_DEMO_MODE = 'true';
    return environment;
  }

  if (!persistentCommands.has(mode)) {
    throw new Error(`Unknown local runtime command: ${mode}.`);
  }

  environment.DEMO_MODE = 'false';
  environment.VITE_DEMO_MODE = 'false';
  environment.VITE_SUPABASE_URL ||= environment.SUPABASE_URL;
  environment.VITE_SUPABASE_PUBLISHABLE_KEY ||=
    environment.SUPABASE_PUBLISHABLE_KEY || environment.SUPABASE_ANON_KEY;
  validatePersistentEnvironment(environment);
  return environment;
}

export function validatePersistentEnvironment(environment) {
  const missing = [
    'APP_WEB_URL',
    'CORS_ORIGIN',
    'DATABASE_URL',
    'PLATFORM_OWNER_EMAILS',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
  ].filter((key) => !text(environment[key]));

  if (!text(environment.SUPABASE_PUBLISHABLE_KEY || environment.SUPABASE_ANON_KEY)) {
    missing.push('SUPABASE_PUBLISHABLE_KEY');
  }
  if (!text(environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY)) {
    missing.push('SUPABASE_SECRET_KEY');
  }
  if (
    !text(
      environment.VITE_SUPABASE_PUBLISHABLE_KEY || environment.VITE_SUPABASE_ANON_KEY,
    )
  ) {
    missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  }
  if (missing.length) {
    throw new Error(
      `Persistent mode is not configured. Missing values: ${missing.join(', ')}. ` +
        'Create .env.local from .env.example and fill the private values.',
    );
  }

  if (!/^postgres(?:ql)?:\/\//i.test(text(environment.DATABASE_URL))) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
}

export function loadRuntimeEnvironmentFiles(rootDirectory = repositoryRoot) {
  const canonicalFile = resolve(rootDirectory, '.env.local');
  const files = existsSync(canonicalFile)
    ? [canonicalFile]
    : [
        resolve(rootDirectory, 'apps/api/.env'),
        resolve(rootDirectory, '.env.staging.local'),
        resolve(rootDirectory, 'apps/web/.env'),
      ].filter(existsSync);

  if (!files.length) {
    throw new Error(
      'Persistent mode requires .env.local. Copy .env.example to .env.local and fill the private values.',
    );
  }

  return {
    environment: files.reduce(
      (loaded, file) => ({ ...loaded, ...parseEnv(readFileSync(file, 'utf8')) }),
      {},
    ),
    files,
  };
}

export function persistentTargetSummary(environment) {
  try {
    const database = new URL(text(environment.DATABASE_URL));
    const supabase = new URL(text(environment.SUPABASE_URL));
    return `PostgreSQL ${database.hostname}:${database.port || '5432'}; Supabase ${supabase.hostname}`;
  } catch {
    return 'persistent services configured';
  }
}

async function main() {
  const mode = process.argv[2] || 'persistent';
  if (mode === 'demo') {
    const environment = prepareRuntimeEnvironment('demo', {}, process.env);
    console.log('Starting explicit demo mode. Data created in this session is not persistent.');
    process.exitCode = await runPnpm(['run', 'dev:workspace'], environment);
    return;
  }

  const loaded = loadRuntimeEnvironmentFiles();
  const environment = prepareRuntimeEnvironment(mode, loaded.environment, process.env);
  const loadedFiles = loaded.files
    .map((file) => relative(repositoryRoot, file).replaceAll('\\', '/'))
    .join(', ');
  console.log(`Persistent mode validated from ${loadedFiles}.`);
  console.log(`Data target: ${persistentTargetSummary(environment)}.`);

  if (mode === 'check') return;
  if (mode === 'setup') {
    for (const script of [
      'db:generate',
      'db:deploy',
      'db:verify:deployed',
      'supabase:bootstrap',
    ]) {
      const code = await runPnpm(['run', script], environment);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
    }
    console.log('Persistent database and private storage are ready.');
    return;
  }

  process.exitCode = await runPnpm(['run', 'dev:workspace'], environment);
}

function runPnpm(arguments_, environment) {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) {
    throw new Error('Run this command through pnpm.');
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [pnpmEntry, ...arguments_], {
      cwd: repositoryRoot,
      env: environment,
      stdio: 'inherit',
    });
    const forwardSigint = () => child.kill('SIGINT');
    const forwardSigterm = () => child.kill('SIGTERM');
    process.once('SIGINT', forwardSigint);
    process.once('SIGTERM', forwardSigterm);
    child.once('error', reject);
    child.once('exit', (code) => {
      process.off('SIGINT', forwardSigint);
      process.off('SIGTERM', forwardSigterm);
      resolvePromise(code ?? 1);
    });
  });
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const directExecution =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
