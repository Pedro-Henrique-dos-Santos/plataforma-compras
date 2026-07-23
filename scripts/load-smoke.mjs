const target = new URL(
  process.env.LOAD_TEST_URL ?? 'http://127.0.0.1:3333/api/health/ready',
);
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!localHosts.has(target.hostname) && process.env.LOAD_TEST_CONFIRM !== 'true') {
  throw new Error('Set LOAD_TEST_CONFIRM=true before testing a remote environment.');
}

const requestCount = positiveInteger('LOAD_TEST_REQUESTS', 100);
const concurrency = Math.min(positiveInteger('LOAD_TEST_CONCURRENCY', 10), requestCount);
const timeoutMs = positiveInteger('LOAD_TEST_TIMEOUT_MS', 5_000);
const p95LimitMs = positiveInteger('LOAD_TEST_P95_LIMIT_MS', 1_000);
const durations = [];
const failures = [];
let cursor = 0;

await Promise.all(Array.from({ length: concurrency }, runWorker));
durations.sort((left, right) => left - right);
const p95 = percentile(durations, 0.95);
const summary = {
  concurrency,
  failed: failures.length,
  maximumMs: round(durations.at(-1) ?? 0),
  p50Ms: round(percentile(durations, 0.5)),
  p95LimitMs,
  p95Ms: round(p95),
  requests: requestCount,
  succeeded: durations.length,
  target: target.origin + target.pathname,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length || p95 > p95LimitMs) {
  process.stderr.write(`${failures.slice(0, 5).join('\n')}\n`);
  process.exitCode = 1;
}

async function runWorker() {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= requestCount) return;
    const startedAt = performance.now();
    try {
      const response = await fetch(target, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.arrayBuffer();
      durations.push(performance.now() - startedAt);
    } catch (error) {
      failures.push(`Request ${index + 1}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function percentile(values, ratio) {
  if (!values.length) return Number.POSITIVE_INFINITY;
  return values[Math.min(Math.ceil(values.length * ratio) - 1, values.length - 1)];
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}
