import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Runs the WDIO desktop suite, always reaps the app's `adl-server` sidecar, and
 * leaves a machine-readable summary behind.
 *
 * `@wdio/tauri-service` terminates the Tauri app process on teardown. On Windows
 * that is a hard kill, so the Rust `Drop` that normally kills the sidecar never
 * runs, leaving `adl-server.exe` alive and holding `target/debug/adl-server.exe`
 * plus the instance's SQLite files. Filtering by the e2e-only data directory
 * keeps dev/other-worktree instances untouched.
 *
 * The summary (`e2e/artifacts/last-run.json`) exists because `e2e/logs/*.log`
 * only contains backend logs — test counts and warnings are printed to stdout,
 * which is awkward to re-read after the fact.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const artifactsDir = path.join(here, 'artifacts');
const summaryPath = path.join(artifactsDir, 'last-run.json');
const E2E_IDENTIFIER = 'com.ai-digital-life.app.e2e';

function sidecarProcesses() {
  if (process.platform !== 'win32') {
    return [];
  }
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='adl-server.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${E2E_IDENTIFIER}*' } | ` +
    `ForEach-Object { $_.ProcessId }`;
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  });
  return (result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function killSidecars() {
  for (const pid of sidecarProcesses()) {
    spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
  }
}

function wdioBin() {
  const require = createRequire(path.join(here, 'noop.cjs'));
  // `@wdio/cli` exports only its main entry; the launcher sits in `<pkg>/bin/wdio.js`.
  const packageRoot = path.resolve(path.dirname(require.resolve('@wdio/cli')), '..');
  return path.join(packageRoot, 'bin', 'wdio.js');
}

const orphansBefore = sidecarProcesses().length;
killSidecars();

const startedAt = new Date();
const started = Date.now();
let output = '';

const child = spawn(
  process.execPath,
  [wdioBin(), 'run', 'wdio.conf.ts', ...process.argv.slice(2)],
  { stdio: ['inherit', 'pipe', 'pipe'], cwd: here },
);

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
  process.stderr.write(chunk);
});

let summaryWritten = false;

function writeSummary(code, signal) {
  if (summaryWritten) {
    return;
  }
  summaryWritten = true;
  killSidecars();

  const sum = (pattern) =>
    [...output.matchAll(pattern)].reduce((total, match) => total + Number(match[1]), 0);
  const summary = {
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - started,
    exitCode: code ?? null,
    signal: signal ?? null,
    args: process.argv.slice(2),
    passing: sum(/(\d+) passing/g),
    failing: sum(/(\d+) failing/g),
    windowFocusWarnings: (output.match(/Could not find window with title/g) ?? []).length,
    orphansBefore,
    orphansAfter: sidecarProcesses().length,
  };

  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
}

child.on('close', (code, signal) => {
  writeSummary(code, signal);
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
