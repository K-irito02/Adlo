#!/usr/bin/env node
/**
 * Vitest launcher that neutralizes Node's experimental global `localStorage`.
 *
 * Node 26 exposes a global `localStorage` (undefined unless `--localstorage-file`
 * is set) that shadows jsdom's implementation inside Vitest workers, breaking
 * every test that touches `window.localStorage`. Passing
 * `--no-experimental-webstorage` restores jsdom's storage. The flag only exists
 * on newer Node versions; check before forwarding it.
 *
 * Usage: `node scripts/run-vitest.mjs run ...` (same args as the vitest CLI).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestBin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const env = { ...process.env };
if (process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')) {
  const options = new Set((env.NODE_OPTIONS ?? '').split(/\s+/).filter(Boolean));
  options.add('--no-experimental-webstorage');
  env.NODE_OPTIONS = [...options].join(' ');
}

const result = spawnSync(process.execPath, [vitestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(result.status ?? 1);
