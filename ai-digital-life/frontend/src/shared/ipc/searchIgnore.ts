/**
 * 检索忽略匹配器（前端三端共用：文件范围前端过滤 / mock 桥 / preview dev 服务）。
 *
 * - 手动名单：精确路径或目录前缀（目录隐含全部后代），见 `isSearchPathExcluded`。
 * - `.gitignore`：类 git 语义的最小子集（VSCode / ripgrep 对齐）——
 *   规则按“根文件在前、深层文件在后、文件内按行序”排列，**最后命中的规则获胜**；
 *   父目录被排除后其下文件不可再被加回（git 原生规则，ripgrep 同样遵守）。
 * - Rust 后端（`crates/workspace/src/gitignore.rs`）镜像实现同一语义，
 *   两侧单测用同一批用例钉住（文件名/行为一致，逐项对照）。
 *
 * 已知与 git 原生的偏差（与 Rust 镜像一致，罕见输入才触发；
 * 端特有差异见 Rust `crates/workspace/src/gitignore.rs` 文件头，两表互为镜像）：
 * - 行首尾空白一律去除（git 行首空格有意义）；
 * - `[...]` 原样交正则：`[!a]` 恰好同为否定故一致，但类内 `/` 可被匹配、
 *   类内转义不支持；未闭合 `[` 已转义处理；
 * - 大小写敏感（`core.ignorecase` 例外未建模）；
 * - `foo/**` 不匹配 `foo` 自身（仅其内容）；
 * - `stripTrailingSlash` 只去一个尾斜杠（`a//` 残留）。
 *
 * 路径约定：工作区相对路径，`/` 分隔，无前导斜杠；`\` 会被归一化为 `/`。
 */

export interface GitignoreRuleSet {
  /** 该 `.gitignore` 所在目录相对工作区根的路径（根为 `''`），`/` 分隔 */
  baseDir: string;
  /** 文件原文（按行解析，注释/空行自动跳过） */
  content: string;
}

interface ParsedPattern {
  negate: boolean;
  dirOnly: boolean;
  anchored: boolean;
  regex: RegExp;
}

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

function stripTrailingSlash(path: string): string {
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

/** glob（`*`/`?`/`**`/`[...]`）转正则；`crossSlash` 决定 `*` 是否可跨 `/`。 */
function globToRegExpSource(glob: string): string {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**`：跨分隔符；`/**/` 整体可省略（匹配零层或多层）。
        if (glob[i + 2] === '/') {
          out += '(.*/)?';
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (c === '[') {
      const close = glob.indexOf(']', i + 1);
      if (close === -1) {
        out += '\\[';
        i += 1;
      } else {
        out += glob.slice(i, close + 1);
        i = close + 1;
      }
    } else {
      out += c.replace(/[.+^${}()|\\]/g, '\\$&');
      i += 1;
    }
  }
  return out;
}

function parsePatternLine(rawLine: string): ParsedPattern | undefined {
  const line = rawLine.trim();
  if (line === '' || line.startsWith('#')) {
    return undefined;
  }
  let negate = false;
  let body = line;
  if (body.startsWith('!')) {
    negate = true;
    body = body.slice(1);
  } else if (body.startsWith('\\!') || body.startsWith('\\#')) {
    body = body.slice(1);
  }
  if (body === '') {
    return undefined;
  }
  let dirOnly = false;
  if (body.endsWith('/')) {
    dirOnly = true;
    body = stripTrailingSlash(body);
  }
  let anchored = false;
  if (body.startsWith('/')) {
    anchored = true;
    body = body.slice(1);
  } else if (body.includes('/')) {
    anchored = true;
  }
  if (body === '') {
    return undefined;
  }
  const regex = new RegExp(`^(?:${globToRegExpSource(body)})$`);
  return { negate, dirOnly, anchored, regex };
}

interface CompiledRuleSet {
  baseDir: string;
  patterns: ParsedPattern[];
}

function compileRuleSets(ruleSets: GitignoreRuleSet[]): CompiledRuleSet[] {
  return ruleSets.map((set) => {
    const baseDir = stripTrailingSlash(normalizeSeparators(set.baseDir));
    const patterns: ParsedPattern[] = [];
    for (const rawLine of set.content.split(/\r?\n/)) {
      const parsed = parsePatternLine(rawLine);
      if (parsed) {
        patterns.push(parsed);
      }
    }
    return { baseDir: baseDir === '/' ? '' : baseDir, patterns };
  });
}

function relativeToBase(path: string, baseDir: string): string | undefined {
  if (baseDir === '') {
    return path;
  }
  if (path === baseDir) {
    return '';
  }
  if (path.startsWith(`${baseDir}/`)) {
    return path.slice(baseDir.length + 1);
  }
  return undefined;
}

function patternMatches(pattern: ParsedPattern, rel: string, isDir: boolean): boolean {
  if (pattern.anchored) {
    if (pattern.regex.test(rel)) {
      return true;
    }
    // 目录规则同时覆盖其下所有后代（git 忽略目录即忽略其内容）：
    // 文件路径的任一祖先前缀命中即视为在被忽略目录之下。
    if (pattern.dirOnly && !isDir) {
      const segments = rel.split('/');
      for (let i = 1; i < segments.length; i += 1) {
        if (pattern.regex.test(segments.slice(0, i).join('/'))) {
          return true;
        }
      }
    }
    return false;
  }
  // 非锚定：任意层级的段名匹配即可；目录规则跳过文件自身的 basename
  //（中间段命中意味着文件位于被忽略目录之下，同样算命中）。
  const segments = rel.split('/');
  const end = !isDir && pattern.dirOnly ? segments.length - 1 : segments.length;
  for (let i = 0; i < end; i += 1) {
    if (pattern.regex.test(segments[i])) {
      return true;
    }
  }
  return false;
}

/**
 * 由 `.gitignore` 规则集构造判定函数（规则集按根→深层顺序传入）。
 * 返回 `(相对路径, 是否目录) => 是否被忽略`。
 */
export function createGitignoreMatcher(
  ruleSets: GitignoreRuleSet[],
): (relativePath: string, isDir: boolean) => boolean {
  const compiled = compileRuleSets(ruleSets);

  const evaluate = (path: string, isDir: boolean): boolean => {
    let ignored = false;
    for (const set of compiled) {
      const rel = relativeToBase(path, set.baseDir);
      // 空 rel 表示"规则目录自身"：.gitignore 只作用于其所在目录之下，
      // 不作用于目录自身（否则子目录的 `*` 会把自身判为忽略，
      // 祖先短路直接返回 true，同文件的 `!` 永无加回机会，事项 F2）。
      if (rel === undefined || rel === '') {
        continue;
      }
      for (const pattern of set.patterns) {
        if (patternMatches(pattern, rel, isDir)) {
          ignored = !pattern.negate;
        }
      }
    }
    return ignored;
  };

  return (relativePath: string, isDir: boolean): boolean => {
    const path = stripTrailingSlash(normalizeSeparators(relativePath));
    if (path === '' || path === '.' || path.startsWith('../')) {
      return false;
    }
    // 父目录被排除后其下文件不可再被加回（git 原生规则）：先逐层判定祖先目录。
    const segments = path.split('/');
    let prefix = '';
    for (let i = 0; i < segments.length - 1; i += 1) {
      prefix = prefix === '' ? segments[i] : `${prefix}/${segments[i]}`;
      if (evaluate(prefix, true)) {
        return true;
      }
    }
    return evaluate(path, isDir);
  };
}

/**
 * 手动忽略名单判定：精确命中或位于被忽略目录之下即视为忽略。
 * 目录条目隐含其全部后代；空名单恒返回 false。
 */
export function isSearchPathExcluded(path: string, excludedPaths: readonly string[]): boolean {
  if (excludedPaths.length === 0) {
    return false;
  }
  const normalized = stripTrailingSlash(normalizeSeparators(path));
  for (const raw of excludedPaths) {
    if (typeof raw !== 'string' || raw.length === 0) {
      continue;
    }
    const ignored = stripTrailingSlash(normalizeSeparators(raw));
    if (normalized === ignored || normalized.startsWith(`${ignored}/`)) {
      return true;
    }
  }
  return false;
}

/** 勾选框三态：已勾选 / 半选（有后代被勾选，折叠时显示小圆点）/ 未勾选。 */
export type IgnoreCheckState = 'checked' | 'partial' | 'unchecked';

export function ignoreCheckStateOf(path: string, ignored: readonly string[]): IgnoreCheckState {
  if (isSearchPathExcluded(path, ignored)) {
    return 'checked';
  }
  const prefix = `${stripTrailingSlash(normalizeSeparators(path))}/`;
  for (const raw of ignored) {
    if (
      typeof raw === 'string' &&
      stripTrailingSlash(normalizeSeparators(raw)).startsWith(prefix)
    ) {
      return 'partial';
    }
  }
  return 'unchecked';
}

/**
 * 切换某路径的忽略态（显式条目语义，保持名单最小）。
 * - 已显式在名单中：去掉自身及全部后代条目；
 * - 否则：新增该条目，并去掉已被覆盖的后代条目。
 * 注意：若该路径仅被祖先条目覆盖（自身不在名单中），此次调用会追加一条冗余
 * 条目（过滤语义不变）；UI 层对这种情况走祖先展开（见树组件），不直接调本函数。
 */
export function toggleIgnoredPath(path: string, ignored: readonly string[]): string[] {
  const normalized = stripTrailingSlash(normalizeSeparators(path));
  const prefix = `${normalized}/`;
  const normalizeEntry = (ig: string) => stripTrailingSlash(normalizeSeparators(ig));
  const isExplicit = ignored.some(
    (ig) => typeof ig === 'string' && normalizeEntry(ig) === normalized,
  );
  const rest = ignored.filter((ig) => {
    if (typeof ig !== 'string') {
      return false;
    }
    const n = normalizeEntry(ig);
    return n !== normalized && !n.startsWith(prefix);
  });
  if (isExplicit) {
    return rest;
  }
  return [...rest, normalized];
}
