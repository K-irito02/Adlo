/**
 * 受影响范围的本地门禁（默认执行）：
 * - lint / format 只跑变更文件（超出阈值时回退全量）
 * - 类型检查与跨语言契约检查为全局不变量，始终执行
 * - 测试只在 src 下发生变更时执行：i18n 字典改动按域收窄（`i18n-test-scope.mjs`），
 *   其余用 `vitest related` 精确挑选受影响用例
 *
 * 全量门禁（check:full / cargo test --workspace / 发布打包）必须先获得用户批准。
 *
 * 用法：node scripts/check-changed.mjs [--base <ref>] [--skip-tests]
 * 修复循环可传 `--base HEAD` 只查本轮改动；中间轮次可加 `--skip-tests`
 * 只跑 lint/format/typecheck，落盘前再跑一次不带该参数的全量受影响范围。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { i18nTestScopes } from './i18n-test-scope.mjs';
import { isRustPath } from '../../scripts/check-rust-changed.mjs';

const options = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const parsed = { base: null, help: false, skipTests: false, fix: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--skip-tests') {
      parsed.skipTests = true;
    } else if (arg === '--fix') {
      parsed.fix = true;
    } else if (arg === '--base') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('missing value for --base');
      }
      parsed.base = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

if (options.help) {
  console.log('usage: node scripts/check-changed.mjs [--base <ref>] [--skip-tests] [--fix]');
  process.exit(0);
}

const cwd = process.cwd();
const MAX_COMMAND_LENGTH = 6000;

// pre-push 钩子会注入 GIT_DIR 等变量；在子目录（frontend）里它们可能是相对路径而解析失败，
// 导致 base 退化为 HEAD、changed=0（门禁静默失效）。统一清掉并用 `git -C repoRoot` 调用。
const cleanGitEnv = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) {
  delete cleanGitEnv[key];
}

function capture(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || ''}`);
  }
  return (result.stdout ?? '').trim();
}

function quote(file) {
  return `"${file.replace(/"/g, '\\"')}"`;
}

/** Known-flaky files are excluded from the affected-range gate; see test:flaky. */
function loadFlakyTests() {
  try {
    const parsed = JSON.parse(readFileSync(new URL('./flaky-tests.json', import.meta.url), 'utf8'));
    return Array.isArray(parsed.tests)
      ? parsed.tests.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [];
  } catch {
    return [];
  }
}

function run(label, command) {
  console.log(`\n[check:changed] ${label}`);
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true, env: cleanGitEnv });
  if (result.status !== 0) {
    console.log(`\n[check:changed] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

/**
 * 测试运行器：vitest 的 dot reporter 在非 TTY 下会逐条输出（本仓全量约 1.7k 行、
 * 单次 30k+ 字符），直接 inherit 会把整段灌进代理上下文。这里捕获输出，只回显
 * 汇总行；失败时回显尾部 120 行供定位。
 */
function runTests(label, command) {
  console.log(`\n[check:changed] ${label}`);
  const result = spawnSync(command, {
    cwd,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    env: cleanGitEnv,
  });
  const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
  const output = stripAnsi(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status !== 0) {
    console.log(output.trim().split(/\r?\n/).slice(-120).join('\n'));
    console.log(`\n[check:changed] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
  const summary = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(Test Files|Tests|Duration)\b/.test(line));
  if (summary.length > 0) {
    for (const line of summary) {
      console.log(`  ${line}`);
    }
  } else {
    console.log('  ok (no tests matched)');
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

const repoRoot = capture('git', ['rev-parse', '--show-toplevel'], { env: cleanGitEnv }).replace(
  /\\/g,
  '/',
);
const git = (args) => capture('git', ['-C', repoRoot, ...args], { env: cleanGitEnv });

function resolveBase(explicit) {
  if (explicit) {
    git(['rev-parse', '--verify', explicit]);
    return { base: explicit, fallback: null };
  }
  try {
    return {
      base: git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim(),
      fallback: null,
    };
  } catch {
    try {
      git(['rev-parse', '--verify', 'origin/main']);
      return { base: 'origin/main', fallback: null };
    } catch {
      return { base: 'HEAD', fallback: 'HEAD' };
    }
  }
}

const frontendDir = cwd.replace(/\\/g, '/');
const prefix = frontendDir.startsWith(repoRoot) ? `${frontendDir.slice(repoRoot.length + 1)}/` : '';

const { base, fallback } = resolveBase(options.base);
if (fallback === 'HEAD') {
  console.warn(
    '[check:changed] WARNING: no upstream and no origin/main; base=HEAD makes the affected scope empty — gates may be vacuous.',
  );
}
const changedSinceBase = git(['diff', '--name-only', '--diff-filter=ACMR', base]).split(/\r?\n/);
const untracked = git(['ls-files', '--others', '--exclude-standard', '--full-name']).split(/\r?\n/);
const repoChanged = [...new Set([...changedSinceBase, ...untracked])].filter(Boolean);
const changed = repoChanged
  .filter((file) => file.startsWith(prefix))
  .map((file) => file.slice(prefix.length));
const rustChanged = repoChanged.some((file) => isRustPath(file));

const lintable = changed.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
const prettierable = changed.filter((f) => /\.(ts|tsx|js|jsx|mjs|css|json|md)$/.test(f));
// 可跑相关测试的变更：`src/**`（应用源码）+ `dev/**`（dev 工具链/预览服务，
// 也有它自己的测试，如 dev/previewWorkspaceService/*.test.ts——此前只跑 src/，
// 导致 15 个 dev 测试文件完全在门禁之外，2026-11-12 retro 修正）。
// i18n 字典收窄仍只认已知字典路径（i18nTestScopes 对未知路径返回 null → 走 related）。
const srcChanges = changed.filter((f) => /^(src|dev)\//.test(f) && /\.(ts|tsx|js|jsx)$/.test(f));
// CSS 文本锁（测试用 `readFileSync` 读样式表）没有 ES import 边，`vitest related` 永远
// 选不中它们；只改 CSS 时门禁会一个测试都不跑。这里显式补跑样式锁。
const cssChanges = changed.filter((f) => /^src\/.*\.css$/.test(f));
// 文档/治理变更：`check:repo` 里的 docs-links / kb-counts / ui-manual / context-budget
// 平时只在 pre-push 跑；P5 文档同步常发生在收尾，这里按变更自动带上，避免漂移到推送才暴露。
const DOC_PATH_PATTERN =
  /^(?:docs\/|\.agents\/|\.opencode\/|\.trae\/|GLOSSARY\.md$|CONTEXT\.md$|AGENTS\.md$|README\.md$|RULES\.md$|SKILLS\.md$|CONTRIBUTING\.md$|SECURITY\.md$|FUTURE-ROADMAP\.md$|RELEASE-CHECKLIST\.md$|adlo\/(?:AGENTS|README|CONTRIBUTING)\.md$)/;
const docsChanged = repoChanged.filter((file) => DOC_PATH_PATTERN.test(file));

console.log(
  `[check:changed] base=${base} changed(frontend)=${changed.length} src=${srcChanges.length}`,
);

// `lint:changed:fix`：只修本轮改动文件，避免 `eslint . --fix` 顺手改写无关
// 配置（2026-11-15 实测：仓库级 lint:fix 改写了 vite.config.ts，只能手工还原）。
if (options.fix) {
  if (lintable.length === 0) {
    console.log('[check:changed] --fix: no lintable changed files');
    process.exit(0);
  }
  if (lintable.length > 100) {
    console.error(
      '[check:changed] --fix refused: >100 changed lintable files; fix in batches or use the full lint:fix intentionally',
    );
    process.exit(1);
  }
  run(
    `eslint --fix (${lintable.length} files)`,
    `npx eslint --fix --no-warn-ignored ${lintable.map(quote).join(' ')}`,
  );
  console.log('[check:changed] fix done; rerun check:changed without --fix');
  process.exit(0);
}

// 改动文件按「零 warning」收口：warning 不阻断时容易长期残留（本仓实测 Array<T>
// 警告跨两轮门禁存活）。全量回退保留现状（vite.config 等既有 warning 不在本轮范围）。
runFileList('eslint', 'npx eslint --max-warnings 0 --no-warn-ignored', lintable, 'npx eslint .');
runFileList(
  'prettier --check',
  'npx prettier --check',
  prettierable,
  'npx prettier --check "src/**/*.{ts,tsx,js,jsx,json,css,md}"',
);

for (const file of changed.filter((f) => f.endsWith('.mjs'))) {
  run(`node --check ${file}`, `node --check ${quote(file)}`);
}

// 配置加载冒烟：`vite.config.ts` 不在 tsc include 内，只有真正加载一次才能发现
// 相对路径/模块解析类错误（2026-10-25 曾漏掉一处 `../../scripts` 写错）。
run('vite config load', 'node scripts/check-vite-config.mjs');

// 源码卫生：注释里出现字面反斜杠加 n 通常意味着一次失败的批量替换（静默失效，无其它门禁可查）。
run('source hygiene', 'node ../scripts/check-source-hygiene.mjs');
// CSS 架构机械禁令（keyframes 属性 / `*` / `!important`）：只扫新增行，行级 allow 标记豁免。
run('css architecture', 'node scripts/check-css-architecture.mjs');
run('css variables', 'node ../scripts/check-css-vars.mjs');
run('dead code (changed files only)', 'node scripts/check-dead-code.mjs');

run('typecheck', 'npx tsc --noEmit');
run('typecheck (dev tooling)', 'npx tsc --noEmit -p dev/tsconfig.json');
// 与 pre-commit 同一棘轮，提前到日常门禁：store 测试新增 `as any` 不再等到
// 最后一次提交才暴露（2026-11-15 R2 实测 22 处）。
run('store cast ratchet', `node ../scripts/check-no-new-any.mjs --base ${quote(base)}`);

if (process.env.ADL_SKIP_RUST === '1') {
  console.log('[check:changed] rust skipped (ADL_SKIP_RUST=1)');
} else if (rustChanged) {
  const baseArg = options.base ? ` --base ${quote(options.base)}` : '';
  run('rust (affected crates)', `node ../scripts/check-rust-changed.mjs${baseArg}`);
} else {
  console.log('[check:changed] rust skipped (no Rust changes)');
}

run('i18n coverage', 'npx tsx scripts/check-i18n-coverage.ts');
run('i18n orphan regressions', 'npx tsx scripts/check-i18n-orphans.ts --changed');
run('no bare CJK source', 'node scripts/check-no-cjk-source.mjs');
run('glossary', 'npx tsx scripts/check-glossary.ts');

if (docsChanged.length > 0) {
  run('docs links', 'node ../scripts/check-docs-links.mjs');
  run('knowledge base counts', 'node ../scripts/check-kb-counts.mjs');
  run('ui manual selectors', 'node ../scripts/check-ui-manual-selectors.mjs');
  run('context budget', 'node ../scripts/check-context-budget.mjs');
} else {
  console.log('[check:changed] docs checks skipped (no docs/rules changes)');
}
run('generated artifacts', 'node scripts/generate-md-theme-vars.mjs');
run(
  'generated artifact drift',
  `git -C "${repoRoot}" diff --exit-code -- ${prefix}src/styles/vendor`,
);

const flakyTests = loadFlakyTests();
const flakyExcludeArgs = flakyTests.map((test) => ` --exclude ${quote(test)}`).join('');
if (flakyTests.length > 0) {
  console.log(`[check:changed] excluding known flaky tests: ${flakyTests.join(', ')}`);
}

if (options.skipTests) {
  console.log('[check:changed] tests skipped (--skip-tests)');
} else {
  let ranTests = false;
  if (srcChanges.length > 0) {
    // i18n 字典被几乎所有组件引用：`vitest related` 会把整张导入图拉进来。
    // 仅当变更文件全部是**已知**字典域时才收窄，未知字典仍走 related（宁可多跑）。
    const i18nScopes = i18nTestScopes(srcChanges);
    if (i18nScopes) {
      runTests(
        `vitest scoped (i18n-only change -> ${i18nScopes.length} dirs)`,
        `npx vitest run ${i18nScopes.map(quote).join(' ')} --passWithNoTests --reporter=dot --silent=passed-only${flakyExcludeArgs}`,
      );
    } else {
      runTests(
        `vitest related (${srcChanges.length} changed source files)`,
        `npx vitest related ${srcChanges.map(quote).join(' ')} --passWithNoTests --reporter=dot --silent=passed-only${flakyExcludeArgs}`,
      );
    }
    ranTests = true;
  }
  if (cssChanges.length > 0) {
    // `src/styles` 下的测试全部是 CSS 文本守卫；`*.css.test.ts` 分散在组件旁。
    const cssTestFiles = git(['ls-files', 'src/**/*.css.test.ts'])
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean)
      .map((file) => (prefix && file.startsWith(prefix) ? file.slice(prefix.length) : file));
    const targets = [...new Set([...cssTestFiles, 'src/styles'])];
    runTests(
      `vitest css style locks (${cssChanges.length} css files)`,
      `npx vitest run ${targets.map(quote).join(' ')} --passWithNoTests --reporter=dot --silent=passed-only${flakyExcludeArgs}`,
    );
    ranTests = true;
  }
  if (!ranTests) {
    console.log('[check:changed] tests skipped (no testable src/dev/css changes)');
  }
}

console.log('\n[check:changed] OK');
