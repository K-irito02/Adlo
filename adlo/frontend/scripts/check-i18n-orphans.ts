import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { zhCN } from '../src/app/i18n/zh-CN/index';
import { enUS } from '../src/app/i18n/en-US/index';

/**
 * 按需运行的孤儿 i18n 键审计（`pnpm run check:i18n:orphans`）。
 * 默认是**报告模式**（exit 0）：全量有数百条历史债，直接当门禁会让一次正常审计
 * 看起来像失败。历史债清理用 `check:i18n:orphans:strict`（Tier A 存在即 exit 1）。
 * `--changed` 是差异感知的回归检查：只找「本次 diff 删掉了生产引用、当前只剩测试/零引用」
 * 的键（pre-commit 与 check:changed 使用），不会追讨历史债。
 *
 * 口径：键在 `src/**` 代码文件（除字典定义目录）中零引用 → Tier A（删除候选）；
 * 仅被测试文件引用 → Tier B（测试脚手架/退役清单引用，需人工判定）。
 * 局限：动态访问（`t[key]`、模板拼接、`Object.keys` 遍历）扫不到，报 Tier A 时
 * 必须先 grep 确认不是动态引用再删键。
 */

function flattenKeys(obj: object, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const dottedKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = flattenKeys(value, dottedKey);
      for (const k of nested) {
        keys.add(k);
      }
    } else {
      keys.add(dottedKey);
    }
  }
  return keys;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkCodeFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // 只跳过字典定义目录（en-US / zh-CN）：同目录下的 __tests__（如
      // keys.test.ts 的退役/恢复清单）仍要参与引用统计，否则退役键会
      // 误报为 Tier A。
      if (basename(dir) === 'i18n' && (entry === 'en-US' || entry === 'zh-CN')) {
        continue;
      }
      walkCodeFiles(full, out);
    } else if (/\.[jt]sx?$/.test(entry) || /\.m?js$/.test(entry) || /\.cjs$/.test(entry)) {
      out.push(full);
    }
  }
}

const srcRoot = join(import.meta.dirname, '..', 'src', 'app');
const allKeys = new Set<string>([...flattenKeys(zhCN), ...flattenKeys(enUS)]);
// 最长优先：短键是长键前缀时交替分支按长度降序（引号/`\b` 已兜底，双保险）。
const sorted = [...allKeys].sort((a, b) => b.length - a.length);
const pattern = new RegExp(
  sorted
    .map((k) => `\\bt\\.${escapeRegExp(k)}\\b|'${escapeRegExp(k)}'|"${escapeRegExp(k)}"`)
    .join('|'),
  'g',
);

const files: string[] = [];
walkCodeFiles(srcRoot, files);

const filesByKey = new Map<string, Set<string>>();
for (const file of files) {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  pattern.lastIndex = 0;
  for (let m = pattern.exec(content); m !== null; m = pattern.exec(content)) {
    let hit = m[0];
    if (hit.startsWith('t.')) {
      hit = hit.slice(2);
    } else {
      hit = hit.slice(1, -1);
    }
    if (!allKeys.has(hit)) {
      continue;
    }
    if (!filesByKey.has(hit)) {
      filesByKey.set(hit, new Set());
    }
    filesByKey.get(hit)!.add(relative(join(import.meta.dirname, '..'), file));
  }
}

const isTestFile = (f: string) => f.includes('__tests__') || /\.test\.[jt]sx?$/.test(f);
const tierA: string[] = [];
const tierB: string[] = [];
for (const key of [...allKeys].sort()) {
  const refs = filesByKey.get(key);
  if (!refs || refs.size === 0) {
    tierA.push(key);
  } else if ([...refs].every(isTestFile)) {
    tierB.push(key);
  }
}

const changedOnly = process.argv.includes('--changed');
const strict = process.argv.includes('--strict');
const repoRoot = (() => {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return result.status === 0 ? (result.stdout ?? '').trim() : '';
})();

function git(args: string[]): string {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) {
    delete env[key];
  }
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', env });
  return result.status === 0 ? (result.stdout ?? '').trim() : '';
}

function resolveBase(): string {
  for (const ref of ['origin/main', 'origin/HEAD']) {
    if (!git(['rev-parse', '--verify', ref])) {
      continue;
    }
    const mergeBase = git(['merge-base', ref, 'HEAD']);
    if (mergeBase) {
      return mergeBase;
    }
  }
  return git(['rev-parse', 'HEAD']) || 'HEAD';
}

if (changedOnly) {
  // 只找「本次 diff 删掉生产引用、当前却没有任何非测试消费方」的键，避免全量历史债。
  const base = resolveBase();
  const diff = git(['diff', '-U0', base, '--', 'adlo/frontend/src']);
  const removedRefs = new Set<string>();
  let currentFile = '';
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length);
      continue;
    }
    if (!line.startsWith('-') || line.startsWith('---')) {
      continue;
    }
    if (isTestFile(currentFile)) {
      continue;
    }
    const text = line.slice(1);
    // `\b` 前边界必须有：否则 `dataset.theme` / `next.theme` / `result.language`
    // 都会被子串 `t.theme` / `t.language` 误判成生产引用。
    for (const match of text.matchAll(/\bt\.([A-Za-z_$][\w$]*)/g)) {
      removedRefs.add(match[1]);
    }
    for (const match of text.matchAll(/['"]([A-Za-z_$][\w$]*)['"]/g)) {
      removedRefs.add(match[1]);
    }
  }
  const regressions = [...removedRefs]
    .filter((key) => allKeys.has(key))
    .filter((key) => tierA.includes(key) || tierB.includes(key))
    .sort();
  if (regressions.length > 0) {
    console.log(
      `❌ i18n 孤儿键回归（本次删除了生产引用、当前只剩测试/零引用，共 ${regressions.length} 个）：`,
    );
    for (const key of regressions) {
      console.log(`  - ${key}  ← ${[...(filesByKey.get(key) ?? [])].join(', ') || 'no refs'}`);
    }
    process.exit(1);
  }
  console.log(
    `✅ 无 i18n 孤儿键回归（base=${base.slice(0, 10)}，检查 ${removedRefs.size} 个被删引用）`,
  );
  process.exit(0);
}

if (tierA.length > 0) {
  console.log(
    `${strict ? '❌' : '⚠️'} 疑似孤儿键 Tier A（零引用，先 grep 排除动态访问再删，共 ${tierA.length} 个）：`,
  );
  for (const key of tierA) {
    console.log(`  - ${key}`);
  }
}
if (tierB.length > 0) {
  console.log(`⚠️  仅测试引用 Tier B（${tierB.length} 个，退役清单/脚手架引用属正常，逐条确认）：`);
  for (const key of tierB) {
    console.log(`  - ${key}  ← ${[...filesByKey.get(key)!].join(', ')}`);
  }
}
if (tierA.length === 0 && tierB.length === 0) {
  console.log(`✅ 无孤儿键（${allKeys.size} 键均有源码引用）`);
  process.exit(0);
}
if (strict) {
  process.exit(tierA.length === 0 ? 0 : 1);
}
console.log('[i18n:orphans] 全量审计仅报告；历史债清理用 `check:i18n:orphans:strict`。');
process.exit(0);
