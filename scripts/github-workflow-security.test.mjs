import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowsDirectory = new URL('../.github/workflows/', import.meta.url);
const workflowNames = (await readdir(workflowsDirectory)).filter((name) => /\.ya?ml$/.test(name));
const workflows = await Promise.all(
  workflowNames.map(async (name) => ({
    name,
    source: await readFile(new URL(name, workflowsDirectory), 'utf8'),
  })),
);
const ciWorkflow = workflows.find(({ name }) => name === 'ci.yml');

test('declares explicit permissions in every GitHub Actions workflow', () => {
  assert.ok(workflows.length > 0, 'At least one workflow is required.');

  for (const workflow of workflows) {
    assert.match(workflow.source, /^permissions:\s*$/m, `${workflow.name} must declare permissions.`);
    assert.doesNotMatch(workflow.source, /^permissions:\s*write-all\s*$/m);
  }
});

test('pins every external GitHub Action to a full commit SHA', () => {
  let externalActionCount = 0;

  for (const workflow of workflows) {
    const actionReferences = workflow.source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm);
    for (const [, reference] of actionReferences) {
      if (reference.startsWith('./')) continue;

      externalActionCount += 1;
      assert.match(
        reference,
        /^[^@\s]+@[0-9a-f]{40}$/,
        `${workflow.name} uses a mutable action reference: ${reference}`,
      );
    }
  }

  assert.ok(externalActionCount > 0, 'At least one external action is required.');
});

test('prepares Supabase roles before applying migrations in plain PostgreSQL CI', () => {
  assert.ok(ciWorkflow, 'ci.yml is required.');

  const rolePreparationIndex = ciWorkflow.source.indexOf(
    '- name: Prepare Supabase-compatible database roles',
  );
  const migrationIndex = ciWorkflow.source.indexOf('- name: Apply database migrations');

  assert.ok(rolePreparationIndex >= 0, 'CI must prepare the Supabase database roles.');
  assert.ok(migrationIndex > rolePreparationIndex, 'CI must prepare roles before migrations.');
  assert.match(
    ciWorkflow.source,
    /DATABASE_ADMIN_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/compras\s/,
  );
  assert.match(ciWorkflow.source, /psql "\$DATABASE_ADMIN_URL" --set ON_ERROR_STOP=1/);
  assert.doesNotMatch(ciWorkflow.source, /psql "\$DATABASE_URL"/);
  assert.match(ciWorkflow.source, /CREATE ROLE anon NOLOGIN NOINHERIT/);
  assert.match(ciWorkflow.source, /CREATE ROLE authenticated NOLOGIN NOINHERIT/);
});
