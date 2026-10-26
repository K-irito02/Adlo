/**
 * 本次变更引入的死代码检查（只查新增/修改的声明，不追溯历史债）。
 *
 * 覆盖四类本仓真实踩过的坑：
 * 1) 改了 CSS 却没有任何 TS/TSX 发出该 class（选择器永远不生效）；
 * 2) 改了 barrel（`index.ts`）新增的导出没有任何消费方；
 * 3) 改了 i18n 字典新增的 key 没有任何 TS/TSX 引用（词典与测试枚举同步膨胀）；
 * 4) 新增 CSS 选择器的复合层级超过 3 层（`css-architecture.md` 上限，超限必然被覆盖或误伤）。
 *
 * 只看变更文件，避免要求维护一份 400+ 条历史死 CSS 基线。
 * 用法：`pnpm --dir frontend run check:dead-code`（check:changed 自动调用）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../src');
const selfFile = path.resolve(here, 'check-dead-code.mjs');

const repoRoot = (() => {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: srcRoot,
    encoding: 'utf8',
  });
  return result.status === 0 ? (result.stdout ?? '').trim() : '';
})();

if (!repoRoot) {
  console.log('[check:dead-code] not a git repository; skipped');
  process.exit(0);
}

/**
 * 清掉 git hook 注入的 GIT_* 环境变量：否则 cwd/index/worktree 会指向 hook 自己的上下文，
 * `git diff` 会把主工作树的状态混进来（实测会误报 459 条历史死 CSS）。
 */
const gitEnv = { ...process.env };
for (const key of Object.keys(gitEnv)) {
  if (key.startsWith('GIT_')) delete gitEnv[key];
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', env: gitEnv });
  return result.status === 0 ? (result.stdout ?? '').trim() : '';
}

/** 本分支的变更基线：优先上游的 merge-base，避免把别人已合入 main 的改动算进来。 */
/**
 * 变更基线：优先 origin/main 的 merge-base。
 * 分支合入 main 之后，上游分支的 merge-base 会把 main 自己的改动也算成“本次变更”，
 * 从而误报 main 的历史死 CSS；用 origin/main 的 merge-base 只留下本分支提交。
 */
function resolveBase() {
  for (const ref of ['origin/main', 'origin/HEAD']) {
    if (!capture('git', ['rev-parse', '--verify', ref])) continue;
    const mergeBase = capture('git', ['merge-base', ref, 'HEAD']);
    if (mergeBase) return mergeBase;
  }
  const upstream = capture('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream) {
    const mergeBase = capture('git', ['merge-base', upstream, 'HEAD']);
    if (mergeBase) return mergeBase;
  }
  return 'HEAD';
}

const base = resolveBase();
const changed = [
  ...capture('git', ['diff', '--name-only', '--diff-filter=ACMR', base]).split(/\r?\n/),
  ...capture('git', ['ls-files', '--others', '--exclude-standard']).split(/\r?\n/),
]
  .map((file) => file.trim())
  .filter(Boolean)
  .map((file) => path.resolve(repoRoot, file))
  .filter((file) => file.startsWith(srcRoot) && file !== selfFile);

function walk(dir, extensions) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const allSourceFiles = walk(srcRoot, ['.ts', '.tsx']).filter((file) => !/\.test\./.test(file));
const allCssFiles = walk(path.join(srcRoot, 'styles'), ['.css']);

/** 全部源码里出现的 class 字面量与模板前缀。 */
const usage = new Set();
const prefixes = new Set();
for (const file of allSourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/adl-[a-z0-9_-]+/g)) {
    usage.add(match[0]);
    if (match[0].endsWith('-')) prefixes.add(match[0]);
  }
}

const problems = [];

/** 只看本次 diff 新增的行（未跟踪/新文件按全新增处理），避免追讨历史死 CSS。 */
function addedText(file) {
  const relative = path.relative(repoRoot, file);
  const diff = capture('git', ['diff', '-U0', base, '--', relative]);
  if (!diff) {
    // 未跟踪文件没有 diff；已跟踪但未变更的文件根本不在 changed 列表里。
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  }
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

/** 文件在 base 提交里是否已存在（用 cat-file 而不是 ls-files，避免 hook 环境的 GIT_DIR 干扰）。 */
function existedInBase(file) {
  const result = spawnSync('git', ['cat-file', '-e', `${base}:${path.relative(repoRoot, file)}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: gitEnv,
  });
  return result.status === 0;
}

// ---- 1) 本次新增的 CSS class 是否被任何源码发出 ----
const changedCss = changed.filter((file) => file.endsWith('.css') && fs.existsSync(file));
for (const file of changedCss) {
  const added = addedText(file);
  // 只查"本次新增"的 class：base 版本里已有的类不算新死代码，
  // 否则整文件重排（prettier 重写选择器列表）会把老类误报成新增。
  const relativeToRepo = path.relative(repoRoot, file).split(path.sep).join('/');
  const baseText = capture('git', ['show', `${base}:${relativeToRepo}`]);
  const baseClasses = new Set(
    [...baseText.matchAll(/\.(adl-[a-z0-9_-]+)/g)].map((match) => match[1]),
  );
  const inFile = new Set(
    [...added.matchAll(/\.(adl-[a-z0-9_-]+)/g)]
      .map((match) => match[1])
      .filter((cls) => !baseClasses.has(cls)),
  );
  for (const cls of inFile) {
    const used = usage.has(cls) || [...prefixes].some((prefix) => cls.startsWith(prefix));
    if (!used) {
      problems.push(
        `${path.relative(srcRoot, file)}: class ".${cls}" is declared but never emitted`,
      );
    }
  }
}

// ---- 2) 本次新增的 barrel 文件里，导出是否有人用 ----
const changedBarrels = changed.filter((file) => file.endsWith('index.ts'));
for (const file of changedBarrels) {
  if (!fs.existsSync(file)) continue;
  // 仅对“新文件”做全量导出检查；修改已有 barrel 时，新增导出由审查覆盖（避免历史导出误报）。
  if (existedInBase(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const block of text.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from/g)) {
    for (const entry of block[1].split(',')) {
      const name = entry
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  const consumers = allSourceFiles
    .filter((source) => source !== file)
    .map((source) => fs.readFileSync(source, 'utf8'))
    .join('\n');
  for (const name of names) {
    if (!new RegExp(`\\b${name}\\b`).test(consumers)) {
      problems.push(`${path.relative(srcRoot, file)}: export "${name}" has no consumer`);
    }
  }
}

// ---- 3) 本次新增的 i18n key 是否被任何源码引用 ----
// 消费方 = 全部源码减去 i18n 字典自身（中英双字典互含对方 key）与测试
// （keys.test 枚举 key 名，会计入误报；测试引用不算产品消费）。
const changedDicts = changed.filter((file) =>
  /app\/i18n\/(zh-CN|en-US)\/[^/]+\.ts$/.test(
    path.relative(srcRoot, file).split(path.sep).join('/'),
  ),
);
for (const file of changedDicts) {
  if (!fs.existsSync(file)) continue;
  const added = addedText(file);
  const keys = new Set([...added.matchAll(/^  ([A-Za-z_$][\w$]*)\s*:/gm)].map((match) => match[1]));
  if (keys.size === 0) continue;
  const consumers = allSourceFiles
    .filter(
      (source) => source !== file && !source.includes(`${path.sep}app${path.sep}i18n${path.sep}`),
    )
    .map((source) => fs.readFileSync(source, 'utf8'))
    .join('\n');
  for (const key of keys) {
    if (!new RegExp(`\\b${key}\\b`).test(consumers)) {
      problems.push(`${path.relative(srcRoot, file)}: i18n key "${key}" has no consumer`);
    }
  }
}

// ---- 4) 本次新增的 CSS 选择器复合层级是否超过 3 层 ----
// 近似口径：去掉属性 [...] 与函数 (...) 内容后，按空白/组合子切分计数。
// 只查 base 里不存在的新选择器（整文件重排不误报历史选择器）。
function selectorDepth(selector) {
  const stripped = selector.replace(/\[[^\]]*\]/g, '[]').replace(/\([^()]*\)/g, '()');
  return stripped.split(/[\s>+~]+/).filter((part) => part && part !== '*').length;
}
function extractSelectors(cssText) {
  const out = new Set();
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const group = match[1].trim();
    if (!group || group.startsWith('@')) continue;
    for (const selector of group.split(',')) {
      const normalized = selector.trim();
      if (normalized && !/^(from|to|\d+%)$/.test(normalized)) out.add(normalized);
    }
  }
  return out;
}
for (const file of changedCss) {
  const added = addedText(file);
  const relativeToRepo = path.relative(repoRoot, file).split(path.sep).join('/');
  const baseText = capture('git', ['show', `${base}:${relativeToRepo}`]);
  const baseSelectors = extractSelectors(baseText);
  for (const selector of extractSelectors(added)) {
    if (baseSelectors.has(selector)) continue;
    const depth = selectorDepth(selector);
    if (depth > 3) {
      problems.push(
        `${path.relative(srcRoot, file)}: selector "${selector}" is ${depth} levels deep (max 3)`,
      );
    }
  }
}

if (problems.length > 0) {
  console.log(`[check:dead-code] base=${base} ${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `[check-dead-code] OK (base=${base}, changed css=${changedCss.length}, barrels=${changedBarrels.length}, dicts=${changedDicts.length})`,
);
