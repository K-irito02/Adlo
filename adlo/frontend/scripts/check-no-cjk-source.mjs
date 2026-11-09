/**
 * 源码裸中文字面量 tripwire：禁止 i18n 字典之外的源码新增裸中文。
 *
 * 动机：本仓所有用户可见文案必须走 i18n key；源码里直接出现中文字面量
 * （如 `{count} 项`、`新建`、`.replace(/搜索引擎/…)`）没有静态检查能拦住——
 * typecheck / eslint / vitest 都不阻止它，只能等审查代理发现（2026-11-10 实证）。
 *
 * 策略：**只扫描本次改动新增的行**（与 `check-source-hygiene` 同口径），
 * 减少对历史乱码 / 遗留文件的噪音；国际化回退永远不应该出现在新代码里。
 *
 * 检查流程：
 *  1. 列出 frontend/src 下新增/修改的 .ts/.tsx 文件（排除 i18n 字典、测试）
 *  2. 用简单状态机把每个文件里的注释（`// …` 行注释、`/* … *\/` 块注释）
 *     抹成等长空格（保留字符串/模板字面量里的中文，那是真正的硬编码文案）
 *  3. 统计哪些**行号**含中文字符
 *  4. 对这些行取 `git diff -U0` 的新增行交集，命中则报告并退出码 1
 *
 * 专用豁免：`cjk-source-allow` 出现在**该行**表示接受；仅用于外部格式规范里
 * 确实出现中文的位置（例如 Chrome 导出文件名解析常量、域常量）。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCOPE_PREFIX = 'adlo/frontend/src';
const ALLOW_MARKER = 'cjk-source-allow';

const CJK_REGEX =
  /[\u3000-\u303f\uff00-\uffef\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\ud840-\ud87f]/;

/** 从 `git diff -U0` 输出解析「新增行」及其在**新文件**里的行号。纯函数，供单测。 */
export function parseAddedLines(diffText) {
  const lines = [];
  let newLine = 0;
  for (const raw of diffText.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('\\')) {
      continue;
    }
    if (raw.startsWith('+')) {
      lines.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith(' ')) {
      newLine += 1;
    }
  }
  return lines;
}

function readStdout(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr ?? ''}`);
  }
  return (result.stdout ?? '').toString();
}

function createGit(repoRoot) {
  return (args) => readStdout('git', ['-C', repoRoot, ...args]);
}

function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function tryResolveBase(git) {
  try {
    return git(['rev-parse', '--abbrev-ref', '@{u}']).trim();
  } catch {
    try {
      git(['rev-parse', '--verify', 'origin/main']);
      return 'origin/main';
    } catch {
      return 'HEAD';
    }
  }
}

function changedFiles(git) {
  const base = tryResolveBase(git);
  const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', base]);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--full-name']);
  const all = [...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)]
    .map((file) => file.trim())
    .filter(Boolean);
  const files = [
    ...new Set(
      all.filter(
        (file) =>
          file.startsWith(`${SCOPE_PREFIX}/`) &&
          /\.(tsx|ts)$/.test(file) &&
          !/i18n\//.test(file) &&
          !/__tests__\//.test(file) &&
          !/\.(test|spec)\.(tsx|ts)$/.test(file),
      ),
    ),
  ];
  return {
    base,
    files,
    untracked: new Set(
      untracked
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean),
    ),
  };
}

/**
 * 把文件里 `//\n` 与 `/* … *\\/`（含 JSX `{/* … *\\/}`）注释抹成等长空格，
 * 返回各含中文行的集合（1-based 行号）。字符串与模板字面量原样保留。
 */
export function bareCjkLines(text) {
  const CH_LINE = '\n'; // 行分隔符
  const mask = new Array(text.length + 1).fill(true); // 是否"保留"该字符（false=注释）

  let i = 0;
  const n = text.length;
  /** 模板字面量嵌套深度（每层 `${` 进入） */
  const templateStack = [];

  let mode = 'code'; // code | lineComment | blockComment | sq | dq | tmpl

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];

    if (mode === 'lineComment') {
      if (ch === CH_LINE) {
        mode = 'code';
      } else {
        mask[i] = false;
      }
      i += 1;
      continue;
    }
    if (mode === 'blockComment') {
      // 保留换行，使 blanked 与原文行号一致（多行注释体内换行不进注释区）
      mask[i] = ch === '\n' || ch === '\r' ? true : false;
      if (ch === '*' && next === '/') {
        mask[i + 1] = false;
        i += 2;
        mode = 'code';
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === 'sq' || mode === 'dq') {
      const end = mode === 'sq' ? "'" : '"';
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === end) {
        mode = 'code';
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === 'tmpl') {
      const depth = templateStack[templateStack.length - 1];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        templateStack.pop();
        if (templateStack.length === 0) {
          mode = 'code';
        }
        i += 1;
        continue;
      }
      if (ch === '$' && next === '{') {
        templateStack[templateStack.length - 1] = depth + 1;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    // code mode
    if (ch === '/' && next === '/') {
      mask[i] = false;
      i += 2;
      mode = 'lineComment';
      continue;
    }
    if (ch === '/' && next === '*') {
      mask[i] = false;
      i += 2;
      mode = 'blockComment';
      continue;
    }
    if (ch === "'") {
      mode = 'sq';
      i += 1;
      continue;
    }
    if (ch === '"') {
      mode = 'dq';
      i += 1;
      continue;
    }
    if (ch === '`') {
      templateStack.push(0);
      mode = 'tmpl';
      i += 1;
      continue;
    }
    if (ch === '{' && templateStack.length > 0) {
      templateStack[templateStack.length - 1] = templateStack[templateStack.length - 1] + 1;
      i += 1;
      continue;
    }
    if (ch === '}' && templateStack.length > 0) {
      const depth = templateStack[templateStack.length - 1];
      if (depth > 0) {
        templateStack[templateStack.length - 1] = depth - 1;
        i += 1;
        continue;
      }
    }
    i += 1;
  }

  const hits = new Set();
  const blanked = text
    .split('')
    .map((ch, idx) => (mask[idx] ? ch : ' '))
    .join('');
  blanked.split(/\r?\n/).forEach((line, index) => {
    if (CJK_REGEX.test(line)) {
      hits.add(index + 1);
    }
  });
  return hits;
}

function main() {
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    console.error('[no-cjk] not inside a git repo');
    process.exit(1);
  }
  const git = createGit(repoRoot);
  const { base, files, untracked } = changedFiles(git);

  const offenders = [];
  for (const relative of files) {
    const absolute = path.join(repoRoot, relative);
    let text;
    try {
      text = readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    const cjkLines = bareCjkLines(text);

    let addedLines;
    if (untracked.has(relative)) {
      addedLines = text
        .split(/\r?\n/)
        .map((lineText, index) => ({ line: index + 1, text: lineText }));
    } else {
      const diff = git(['diff', '-U0', '--no-color', base, '--', relative]);
      addedLines = parseAddedLines(diff);
    }
    for (const { line, text: rawText } of addedLines) {
      if (!cjkLines.has(line)) {
        continue;
      }
      if (rawText.includes(ALLOW_MARKER)) {
        continue;
      }
      offenders.push(`${relative}:${line}  ${rawText.trim().slice(0, 200)}`);
    }
  }

  if (offenders.length > 0) {
    console.error('[no-cjk] added lines contain bare CJK outside the i18n dictionaries:');
    for (const entry of offenders) {
      console.error(`  ${entry}`);
    }
    console.error(
      `[no-cjk] wrap visible strings in an i18n key (zh-CN + en-US in sync), put literals in the i18n dicts, or add "${ALLOW_MARKER}" only for a real external-format constant.`,
    );
    process.exit(1);
  }
  console.log(`[no-cjk] ok (${files.length} files in scope)`);
}

const isMain =
  Boolean(process.argv[1]) &&
  pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase();

if (isMain) {
  main();
}
