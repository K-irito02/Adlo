/**
 * Run the tests registered in `flaky-tests.json` separately from `check:changed`.
 *
 * `check:changed` excludes these files so a known-flaky test cannot block the
 * affected-range gate; this script keeps them visible instead of silently
 * dropping coverage.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readFlakyTests() {
  try {
    const parsed = JSON.parse(
      readFileSync(path.join(frontendDir, 'scripts', 'flaky-tests.json'), 'utf8'),
    );
    return Array.isArray(parsed.tests)
      ? parsed.tests.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [];
  } catch (error) {
    console.error(`[test:flaky] cannot read scripts/flaky-tests.json: ${error.message}`);
    process.exit(1);
  }
}

const tests = readFlakyTests();
if (tests.length === 0) {
  console.log('[test:flaky] no known flaky tests');
  process.exit(0);
}

const result = spawnSync(
  'npx',
  ['vitest', 'run', ...tests, '--reporter=dot', '--silent=passed-only'],
  { cwd: frontendDir, stdio: 'inherit', shell: true },
);
process.exit(result.status ?? 1);
