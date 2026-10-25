/**
 * 源码卫生检查（只查机械性、静默失效的编辑事故）。
 *
 * 背景：2026-10-25 有 3 处注释被脚本批量替换写成字面量 `\n`（PowerShell 单引号串），hygiene-allow
 * 静态门禁全绿，只有人工审查发现。这里把该失败模式变成确定性检查。
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CHECK_EXTENSIONS = new Set([".rs", ".ts", ".tsx", ".mjs", ".css"]);
const COMMENT_PREFIX = /^\s*(\/\/|\/\*|\*)/;
const ALLOW_MARKER = "hygiene-allow";

/** 返回注释行里含字面量 `\n` 的行（1-based 行号）。纯函数，供单测。hygiene-allow */
export function findLiteralEscapedNewlines(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!COMMENT_PREFIX.test(line) || !line.includes("\\n") || line.includes(ALLOW_MARKER)) {
      return;
    }
    hits.push({ line: index + 1, text: line.trim() });
  });
  return hits;
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "") : "";
}

function changedFiles(repoRoot) {
  let base = "origin/main";
  const upstream = capture("git", ["rev-parse", "--abbrev-ref", "@{u}"], repoRoot).trim();
  if (upstream) {
    base = upstream;
  }
  const tracked = capture("git", ["diff", "--name-only", "--diff-filter=ACMR", base], repoRoot);
  const untracked = capture("git", ["ls-files", "--others", "--exclude-standard"], repoRoot);
  return [...new Set([...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)])]
    .map((file) => file.trim())
    .filter((file) => CHECK_EXTENSIONS.has(path.extname(file)));
}

function main() {
  const repoRoot = capture("git", ["rev-parse", "--show-toplevel"], process.cwd()).trim();
  if (!repoRoot) {
    console.error("[hygiene] not inside a git repo");
    process.exit(1);
  }

  const offenders = [];
  for (const relative of changedFiles(repoRoot)) {
    const absolute = path.join(repoRoot, relative);
    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    for (const hit of findLiteralEscapedNewlines(text)) {
      offenders.push(`${relative}:${hit.line}  ${hit.text}`);
    }
  }

  if (offenders.length > 0) {
    console.error('[hygiene] literal "\\n" inside comments (likely a broken bulk edit):');
    for (const entry of offenders) {
      console.error(`  ${entry}`);
    }
    console.error(
      '[hygiene] rewrite the comment with real newlines (or add "hygiene-allow" if intentional).',
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
