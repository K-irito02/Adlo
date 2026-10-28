import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Runs the WDIO desktop suite and always reaps the app's `adl-server` sidecar.
 *
 * `@wdio/tauri-service` terminates the Tauri app process on teardown. On Windows
 * that is a hard kill, so the Rust `Drop` that normally kills the sidecar never
 * runs, leaving `adl-server.exe` alive and holding `target/debug/adl-server.exe`
 * plus the instance's SQLite files. Filtering by the e2e-only data directory
 * keeps dev/other-worktree instances untouched.
 *
 * The pre-run sweep matters too: a leftover sidecar from a previous aborted run
 * keeps the binary locked, which makes the next `cargo build` fail with
 * `PermissionDenied`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const E2E_IDENTIFIER = 'com.ai-digital-life.app.e2e';

function killSidecars() {
  if (process.platform !== 'win32') {
    return;
  }
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='adl-server.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${E2E_IDENTIFIER}*' } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
  });
}

function wdioBin() {
  const require = createRequire(path.join(here, 'noop.cjs'));
  // `@wdio/cli` exports only its main entry; the launcher sits in `<pkg>/bin/wdio.js`.
  const packageRoot = path.resolve(path.dirname(require.resolve('@wdio/cli')), '..');
  return path.join(packageRoot, 'bin', 'wdio.js');
}

killSidecars();

const child = spawn(
  process.execPath,
  [wdioBin(), 'run', 'wdio.conf.ts', ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: here },
);

child.on('exit', (code, signal) => {
  killSidecars();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
