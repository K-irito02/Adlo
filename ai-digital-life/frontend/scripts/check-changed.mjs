/**
 * 受影响范围的本地门禁（默认执行）：
 * - lint / format 只跑变更文件（超出阈值时回退全量）
 * - 类型检查与跨语言契约检查为全局不变量，始终执行
 * - 测试只在 src 下发生变更时执行，并用 `vitest related` 精确挑选受影响用例
 *
 * 全量门禁（check:full / cargo test --workspace / 发布打包）必须先获得用户批准。
 */
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const MAX_COMMAND_LENGTH = 6000;

function capture(cmd, args) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || ''}`);
  }
  return (result.stdout ?? '').trim();
}

function quote(file) {
  return `"${file.replace(/"/g, '\\"')}"`;
}

function run(label, command) {
  console.log(`\n[check:changed] ${label}`);
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.log(`\n[check:changed] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function runFileList(label, prefix, files, fallback) {
  if (files.length === 0) {
    console.log(`[check:changed] ${label} skipped (no matching changed files)`);
    return;
  }
  const command = `${prefix} ${files.map(quote).join(' ')}`;
  if (files.length > 100 || command.length > MAX_COMMAND_LENGTH) {
    run(`${label} (full, many files changed)`, fallback);
    return;
  }
  run(`${label} (${files.length} files)`, command);
}

function resolveBase() {
  try {
    return capture('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
  } catch {
    try {
      capture('git', ['rev-parse', '--verify', 'origin/main']);
      return 'origin/main';
    } catch {
      return 'HEAD';
    }
  }
}

const repoRoot = capture('git', ['rev-parse', '--show-toplevel']).replace(/\\/g, '/');
const frontendDir = cwd.replace(/\\/g, '/');
const prefix = frontendDir.startsWith(repoRoot) ? `${frontendDir.slice(repoRoot.length + 1)}/` : '';

const base = resolveBase();
const changedSinceBase = capture('git', ['diff', '--name-only', '--diff-filter=ACMR', base]).split(
  /\r?\n/,
);
const untracked = capture('git', ['ls-files', '--others', '--exclude-standard']).split(/\r?\n/);
const changed = [...new Set([...changedSinceBase, ...untracked])]
  .filter(Boolean)
  .filter((file) => file.startsWith(prefix))
  .map((file) => file.slice(prefix.length));

const lintable = changed.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
const prettierable = changed.filter((f) => /\.(ts|tsx|js|jsx|css|json|md)$/.test(f));
const srcChanges = changed.filter((f) => f.startsWith('src/') && /\.(ts|tsx|js|jsx)$/.test(f));

console.log(
  `[check:changed] base=${base} changed(frontend)=${changed.length} src=${srcChanges.length}`,
);

runFileList('eslint', 'npx eslint', lintable, 'npx eslint .');
runFileList(
  'prettier --check',
  'npx prettier --check',
  prettierable,
  'npx prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}"',
);

run('typecheck', 'npx tsc --noEmit');
run('typecheck (dev tooling)', 'npx tsc --noEmit -p dev/tsconfig.json');
run('i18n coverage', 'npx tsx scripts/check-i18n-coverage.ts');
run('glossary', 'npx tsx scripts/check-glossary.ts');
run('generated artifacts', 'node scripts/generate-md-theme-vars.mjs');
run('generated artifact drift', 'git diff --exit-code -- src/styles/vendor');

if (srcChanges.length > 0) {
  run(
    `vitest related (${srcChanges.length} changed source files)`,
    `npx vitest related ${srcChanges.map(quote).join(' ')} --passWithNoTests`,
  );
} else {
  console.log('[check:changed] tests skipped (no src changes)');
}

console.log('\n[check:changed] OK');
