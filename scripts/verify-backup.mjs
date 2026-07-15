import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = process.argv[2] ?? process.env.BACKUP_FILE;
if (!input) throw new Error('Pass the backup file path or set BACKUP_FILE.');
const backupFile = resolve(input);
await access(backupFile);

const output = await run(process.env.PG_RESTORE_BINARY ?? 'pg_restore', ['--list', backupFile]);
const entries = output
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith(';'));
if (!entries.length) throw new Error('The backup has no restorable entries.');
process.stdout.write(`Backup structure verified: ${entries.length} entries.\n`);

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(`${command} was not found. Install PostgreSQL client tools first.`)
          : error,
      );
    });
    child.once('exit', (code) => {
      if (code === 0) resolveRun(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}
