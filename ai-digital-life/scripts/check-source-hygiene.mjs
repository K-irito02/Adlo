/**
 * 源码卫生检查（只查机械性、静默失效的编辑事故）。
 *
 * 背景：2026-10-25 有 3 处注释被脚本批量替换写成字面量 `\n`（PowerShell 单引号串），hygiene-allow
 * 静态门禁全绿，只有人工审查发现。这里把该失败模式变成确定性检查。
 *
 * 2026-11-01 扩展：批量编辑还会留下 U+FFFD / BOM / 常见 mojibake；未发布阶段也可能
 * 误加「兼容历史」代码。三类都走同一套「只查变更文件」的 tripwire。 // compat-allow: doc
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".rs", ".ts", ".tsx", ".mjs", ".css"]);
const CHECK_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ".md"]);
const COMMENT_PREFIX = /^\s*(\/\/|\/\*|\*)/;
const ALLOW_MARKER = "hygiene-allow";
const COMPAT_ALLOW_MARKER = "compat-allow";
// 兼容历史|历史格式|旧格式|数据格式兼容|旧版本迁移|legacy (data )?(format|compat)  // compat-allow: pattern list
const COMPAT_PATTERN =
  /兼容历史|历史(?:数据)?格式|旧(?:数据)?格式|数据格式兼容|旧版本迁移|legacy (?:data )?(?:format|compat)/i; // compat-allow: detector pattern
const MOJIBAKE_MARKERS = ["\u951f\u65a4\u62f7", "\u70eb\u70eb\u70eb", "\u5c6f\u5c6f\u5c6f"];

/** 返回注释行里含字面量 `\n` 的行（1-based 行号）。纯函数，供单测。hygiene-allow */
export function findLiteralEscapedNewlines(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!COMMENT_PREFIX.test(line) || line.includes(ALLOW_MARKER)) {
      return;
    }
    // 去掉行内代码（反引号包裹）再判定：注释里引用语法示例（如 `.a,\n.b`）是合法的。
    const withoutInlineCode = line.replace(/`[^`]*`/g, "");
    if (!withoutInlineCode.includes("\\n")) {
      return;
    }
    hits.push({ line: index + 1, text: line.trim() });
  });
  return hits;
}

/** U+FFFD 替换字符通常意味着一次失败的编码转换/批量写入。 */
export function findReplacementChars(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.includes("\uFFFD")) {
      return;
    }
    if (line.includes(ALLOW_MARKER)) {
      return;
    }
    hits.push({ line: index + 1, text: line.trim() });
  });
  return hits;
}

/** 文件头 UTF-8 BOM；仓库统一无 BOM，防止 shell 写入带回 BOM。 */
export function hasBom(text) {
  return text.charCodeAt(0) === 0xfeff;
}

/** 常见中文 mojibake 序列（GBK/UTF-8 错配或未初始化内存）。 */
export function findMojibake(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) {
      return;
    }
    if (MOJIBAKE_MARKERS.some((marker) => line.includes(marker))) {
      hits.push({ line: index + 1, text: line.trim() });
    }
  });
  return hits;
}

/**
 * 未发布阶段禁止的数据格式兼容/旧版本代码。只做文本 tripwire： // compat-allow: doc
 * 外部协议（OS `NO_PROXY`、npm 逗号格式等）用 `compat-allow: <理由>` 显式豁免。
 */
export function findLegacyCompatibility(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes(COMPAT_ALLOW_MARKER)) {
      return;
    }
    if (COMPAT_PATTERN.test(line)) {
      hits.push({ line: index + 1, text: line.trim() });
    }
  });
  return hits;
}

/** 兼容检查只覆盖产品源码与当前设计/架构文档；规则文本与历史计划不追溯。 */
export function isCompatibilityScope(relative) {
  return (
    relative.startsWith("ai-digital-life/") ||
    relative === "GLOSSARY.md" ||
    relative.startsWith("docs/design-system/") ||
    relative.startsWith("docs/architecture/")
  );
}

/**
 * 干净的 git 调用：显式 `-C repoRoot`，并剔除 hook 注入的 GIT_* 覆盖。
 * pre-push 钩子会把 `GIT_DIR` 设为相对路径；子目录（frontend）调用 git 时它解析失败，
 * 导致 base 退化成 HEAD、diff 为空（曾有审查因此漏扫）。
 */
function createGit(repoRoot) {
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) {
    delete env[key];
  }
  return (args) => spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", env });
}

function readStdout(result) {
  return result.status === 0 ? (result.stdout ?? "") : "";
}

function changedFiles(git) {
  let base = "HEAD";
  const upstream = readStdout(git(["rev-parse", "--abbrev-ref", "@{u}"])).trim();
  if (upstream) {
    base = upstream;
  } else {
    const originMain = readStdout(git(["rev-parse", "--verify", "--quiet", "origin/main"])).trim();
    base = originMain ? "origin/main" : "HEAD";
  }
  const tracked = readStdout(git(["diff", "--name-only", "--diff-filter=ACMR", base]));
  const untracked = readStdout(git(["ls-files", "--others", "--exclude-standard", "--full-name"]));
  const files = [...new Set([...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)])]
    .map((file) => file.trim())
    .filter((file) => CHECK_EXTENSIONS.has(path.extname(file)));
  return { base, files };
}

/** 从 cwd 向上找 `.git`（工作树里是文件、普通仓库是目录），不依赖可能被 hook 改写的 GIT_DIR。 */
function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function main() {
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    console.error("[hygiene] not inside a git repo");
    process.exit(1);
  }

  const git = createGit(repoRoot);
  const { base, files } = changedFiles(git);
  if (process.env.ADL_HYGIENE_DEBUG === "1") {
    console.error(`[hygiene:debug] repoRoot=${repoRoot} base=${base} files=${files.length}`);
  }

  const offenders = [];
  for (const relative of files) {
    const absolute = path.join(repoRoot, relative);
    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    const extension = path.extname(relative);
    if (SOURCE_EXTENSIONS.has(extension)) {
      for (const hit of findLiteralEscapedNewlines(text)) {
        offenders.push(`[literal \\n] ${relative}:${hit.line}  ${hit.text.slice(0, 160)}`);
      }
    }
    for (const hit of findReplacementChars(text)) {
      offenders.push(`[U+FFFD] ${relative}:${hit.line}  ${hit.text.slice(0, 160)}`);
    }
    for (const hit of findMojibake(text)) {
      offenders.push(`[mojibake] ${relative}:${hit.line}  ${hit.text.slice(0, 160)}`);
    }
    if (hasBom(text)) {
      offenders.push(`[BOM] ${relative}:1  UTF-8 BOM (write UTF-8 without BOM)`);
    }
    if (isCompatibilityScope(relative)) {
      for (const hit of findLegacyCompatibility(text)) {
        offenders.push(`[legacy-compat] ${relative}:${hit.line}  ${hit.text.slice(0, 160)}`);
      }
    }
  }

  if (offenders.length > 0) {
    console.error("[hygiene] changed files contain silent-edit hazards:");
    for (const entry of offenders) {
      console.error(`  ${entry}`);
    }
    console.error(
      '[hygiene] use edit/write (not shell -replace/Set-Content/sed). Add "hygiene-allow" for an intentional literal/encoding sample, or "compat-allow: <reason>" only for a real external format. The unreleased product must not carry data-format compatibility code.',
    );
    process.exit(1);
  }

  console.log("[hygiene] ok");
}

const isMain =
  Boolean(process.argv[1]) &&
  pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase();

if (isMain) {
  main();
}
