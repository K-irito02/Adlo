import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const fileArgIndex = process.argv.indexOf('--file');
const glossaryPath =
  fileArgIndex !== -1 && process.argv[fileArgIndex + 1]
    ? path.resolve(process.cwd(), process.argv[fileArgIndex + 1] as string)
    : path.resolve(here, '../../../GLOSSARY.md');

const IMPLEMENTATION_TOKEN = /`[^`]*(\/|\\|::|\.(?:rs|ts|tsx|js|jsx|css|json|toml|sql)\b)[^`]*`/;
const NUMERIC_COUNT = /\d+\s*个/;
const ALLOW_MARKER = 'glossary-allow';

/**
 * 强制词（反引号包裹的 `_Avoid_`）扫描范围：中文 UI 文案、运维/架构文档，以及产品源码。
 * 源码扫描覆盖注释与字符串——两者都是代理与用户可见的用词面；只查强制词（如 `中间区`），
 * 不做全量 `_Avoid_` 词检查，避免 `viewer`、`工作区` 这类正常用词误报。
 * 有意引用强制词时在该行加 `glossary-allow`。
 */
const ENFORCED_SOURCES = [
  { root: path.join(here, '../src'), extensions: ['.ts', '.tsx'] },
  { root: path.join(repoRoot, 'docs/operations'), extensions: ['.md'] },
  { root: path.join(repoRoot, 'docs/architecture'), extensions: ['.md'] },
  { root: path.join(repoRoot, 'adlo/crates'), extensions: ['.rs'] },
  { root: path.join(repoRoot, 'adlo/src-tauri'), extensions: ['.rs'] },
];

function fail(messages: string[]): never {
  console.log(`GLOSSARY.md check failed (${messages.length} problem(s)):`);
  for (const message of messages) {
    console.log(`  - ${message}`);
  }
  process.exit(1);
}

if (!fs.existsSync(glossaryPath)) {
  fail([`missing file: ${glossaryPath}`]);
}

const lines = fs.readFileSync(glossaryPath, 'utf8').split(/\r?\n/);
const problems: string[] = [];
let termCount = 0;

lines.forEach((line, index) => {
  if (!/^\*\*[^*]+\*\*:/.test(line)) {
    return;
  }
  termCount += 1;
  const term = line.replace(/^\*\*([^*]+)\*\*:.*$/, '$1');

  let hasAvoid = false;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const entryLine = lines[cursor];
    if (entryLine.trim() === '') {
      break;
    }
    if (entryLine.startsWith('_Avoid_:')) {
      hasAvoid = true;
      break;
    }
  }
  if (!hasAvoid) {
    problems.push(`line ${index + 1} "${term}": missing _Avoid_ line`);
  }
});

lines.forEach((line, index) => {
  if (IMPLEMENTATION_TOKEN.test(line)) {
    problems.push(`line ${index + 1}: implementation detail (path/file token) in glossary`);
  }
  if (NUMERIC_COUNT.test(line)) {
    problems.push(`line ${index + 1}: stale-prone numeric count in glossary`);
  }
});

/**
 * Markdown 强调符损坏守卫：Prettier 会把未用反引号包裹的环境变量名（HTTP_PROXY）
 * 当成强调解析，改写成 HTTP*PROXY，并把 `_Avoid_` 转义成 `\_Avoid_`。这类损坏在
 * 语义上把术语定义改错，却不会触发「缺 _Avoid_」检查，因此单独扫正文行。
 */
lines.forEach((line, index) => {
  if (line.startsWith('_Avoid_:') || /^\*\*[^*]+\*\*:/.test(line)) {
    return;
  }
  const stripped = line.replace(/`[^`]*`/g, '');
  if (/\\_/.test(stripped) || /\*/.test(stripped)) {
    problems.push(
      `line ${index + 1}: 定义正文出现强调记号（* 或转义 _）——请改成普通文本；标识符/命令用反引号包裹（不是环境变量才需要反引号）`,
    );
  }
});

/**
 * 反引号包裹的 _Avoid_ 词是“强制词”：必须不出现在中文 UI 文案与操作手册里。
 * 约定见 docs/agents/domain.md；新增强制词只需在词汇表里加反引号。
 */
function enforcedTerms(): string[] {
  const terms = new Set<string>();
  for (const line of lines) {
    if (!line.startsWith('_Avoid_:')) {
      continue;
    }
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const value = match[1]?.trim();
      if (value) {
        terms.add(value);
      }
    }
  }
  return [...terms];
}

function walk(dir: string, extensions: string[]): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, extensions));
      continue;
    }
    if (extensions.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const enforced = enforcedTerms();
if (enforced.length > 0) {
  for (const source of ENFORCED_SOURCES) {
    for (const file of walk(source.root, source.extensions)) {
      const content = fs.readFileSync(file, 'utf8');
      content.split(/\r?\n/).forEach((line, index) => {
        if (line.includes(ALLOW_MARKER)) {
          return;
        }
        for (const term of enforced) {
          if (line.includes(term)) {
            problems.push(
              `${path.relative(repoRoot, file)}:${index + 1}: uses avoided term "${term}" (add ${ALLOW_MARKER} to the line if intentional)`,
            );
          }
        }
      });
    }
  }
}

if (termCount === 0) {
  problems.push('no term entries found');
}

if (problems.length > 0) {
  fail(problems);
}

console.log(
  `GLOSSARY.md OK (${termCount} terms, all with _Avoid_; enforced avoided terms: ${enforced.join(', ') || 'none'})`,
);
