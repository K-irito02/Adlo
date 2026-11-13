/**
 * CSS 架构机械禁令守卫（真源规则：`.agents/rules/css-architecture.md`）。
 *
 * 只检查**本次改动的 CSS 新增行**，避免历史样式的既有偏差把门禁变成噪声
 * （与 `check-no-cjk-source.mjs` 同口径）。三条规则都是固定语法模式，
 * 用确定性检查而不是让审查代理每轮人肉核对：
 *
 * 1. `@keyframes` 内只允许 `transform` / `opacity`；
 *    确有必要的偏离（如开屏名称收字距）在该行写 `animation-prop-allow: …`。
 * 2. 选择器禁用 `*` 通配；确有必要时写 `selector-allow: …`。
 * 3. 禁用 `!important`；覆盖第三方库或浏览器伪元素时写 `important-allow: …`。
 *
 * 注释会先被抹成等长空格再判断，避免说明文字里的 `!important` / `*` 误报。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAddedLines } from './check-no-cjk-source.mjs';

const SCOPE_PREFIX = 'adlo/frontend/src';
const ANIMATION_PROPS = new Set(['transform', 'opacity']);
const ALLOW = {
  prop: 'animation-prop-allow',
  selector: 'selector-allow',
  important: 'important-allow',
};

/** 把 `/* … *\/` 注释抹成等长空格（保留换行，行号不变）。 */
export function blankComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('/*', i);
    if (start === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    const end = text.indexOf('*/', start + 2);
    const stop = end === -1 ? text.length : end + 2;
    out += text.slice(start, stop).replace(/[^\n]/g, ' ');
    i = stop;
  }
  return out;
}

/** 返回落在 `@keyframes` 块内的行号集合（1-based）。 */
export function keyframeLines(blanked) {
  const lines = new Set();
  const marks = [];
  let line = 1;
  for (let i = 0; i < blanked.length; i += 1) {
    const ch = blanked[i];
    if (ch === '\n') {
      line += 1;
      continue;
    }
    if (ch === '@' && blanked.startsWith('@keyframes', i)) {
      let depth = 0;
      let started = false;
      let probeLine = line;
      for (let j = i; j < blanked.length; j += 1) {
        const c = blanked[j];
        if (c === '\n') {
          probeLine += 1;
        } else if (c === '{') {
          depth += 1;
          started = true;
        } else if (c === '}') {
          depth -= 1;
          if (started && depth === 0) {
            marks.push([line, probeLine]);
            i = j;
            line = probeLine;
            break;
          }
        }
        if (started && depth === 0 && j > i) {
          marks.push([line, probeLine]);
          i = j;
          line = probeLine;
          break;
        }
      }
    }
  }
  for (const [from, to] of marks) {
    for (let n = from; n <= to; n += 1) {
      lines.add(n);
    }
  }
  return lines;
}

const UNIVERSAL_SELECTOR = /(^|[,\s>+~])\*(\s*[,{]|$)/;

/** 纯函数：返回违规列表（供单测）。`added` 为 [{ line, raw, text }]。 */
export function findViolations(blanked, added) {
  const kfLines = keyframeLines(blanked);
  const problems = [];
  for (const { line, raw, text } of added) {
    const code = text.replace(/\s+$/, '');
    if (kfLines.has(line)) {
      // 兼容单行 keyframes（`from { width: 1px; }`）：按声明起点抓属性。
      const props = new Set(
        [...code.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:/g)].map((match) => match[1]),
      );
      for (const prop of props) {
        if (!ANIMATION_PROPS.has(prop) && !raw.includes(ALLOW.prop)) {
          problems.push({
            line,
            rule: 'animation-property',
            message: `@keyframes 内只允许 transform/opacity，发现 "${prop}"（确有必要请标 ${ALLOW.prop}）`,
            text: code,
          });
        }
      }
    }
    if (UNIVERSAL_SELECTOR.test(code) && !raw.includes(ALLOW.selector)) {
      problems.push({
        line,
        rule: 'universal-selector',
        message: `禁止 * 通配选择器（确有必要请标 ${ALLOW.selector}）`,
        text: code,
      });
    }
    if (code.includes('!important') && !raw.includes(ALLOW.important)) {
      problems.push({
        line,
        rule: 'important',
        message: `禁止 !important（覆盖第三方库时请标 ${ALLOW.important}）`,
        text: code,
      });
    }
  }
  return problems;
}

function readStdout(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr ?? ''}`);
  }
  return (result.stdout ?? '').toString();
}

function createGit(repoRoot) {
  return (args) => readStdout('git', ['-C', repoRoot, ...args], repoRoot);
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

function resolveBase(git) {
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

function main() {
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    console.error('[css-architecture] not inside a git repo');
    process.exit(1);
  }
  const git = createGit(repoRoot);
  const base = resolveBase(git);
  const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', base]);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--full-name']);
  const changed = [...new Set([...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)])]
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => file.startsWith(`${SCOPE_PREFIX}/`) && file.endsWith('.css'));

  const offenders = [];
  for (const relative of changed) {
    const absolute = path.join(repoRoot, relative);
    let text;
    try {
      text = readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    const blanked = blankComments(text);
    const blankLines = blanked.split(/\r?\n/);
    const rawLines = text.split(/\r?\n/);
    const untrackedFile = untracked.split(/\r?\n/).includes(relative);
    const addedLines = untrackedFile
      ? blankLines.map((_text, index) => ({ line: index + 1 }))
      : parseAddedLines(git(['diff', '-U0', '--no-color', base, '--', relative]));
    // 语法判断用「抹掉注释后的行」；豁免标记必须看原始行（标记写在注释里）。
    const added = addedLines.map(({ line }) => ({
      line,
      raw: rawLines[line - 1] ?? '',
      text: blankLines[line - 1] ?? '',
    }));

    for (const problem of findViolations(blanked, added)) {
      offenders.push(`${relative}:${problem.line}  [${problem.rule}] ${problem.message}`);
    }
  }

  if (offenders.length > 0) {
    console.error('[css-architecture] 新增 CSS 违反机械禁令：');
    for (const entry of offenders) {
      console.error(`  ${entry}`);
    }
    console.error('[css-architecture] 规则真源：.agents/rules/css-architecture.md');
    process.exit(1);
  }
  console.log(`[css-architecture] ok (${changed.length} changed css files)`);
}

const isMain =
  Boolean(process.argv[1]) &&
  pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase();

if (isMain) {
  main();
}
