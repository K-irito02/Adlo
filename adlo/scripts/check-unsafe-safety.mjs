/**
 * 新增 `unsafe` 块的 SAFETY 注释门禁（只查本次变更）。
 *
 * 本仓规则要求每个 `unsafe` 块写明不变量（`project-engineering-constraints.md`），
 * 但 clippy 默认不检查；全仓已有历史 unsafe，直接开
 * `clippy::undocumented_unsafe_blocks` 会把存量债务一次性变成红门禁。这里与
 * `check-dead-code` 同一策略：只看本次 diff 新增的 `unsafe {`，要求同行或紧邻的
 * 注释块里有 `// SAFETY:`。
 *
 * 用法：`node adlo/scripts/check-unsafe-safety.mjs [--base <ref>]`
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const adloRoot = path.resolve(here, "..");
const repoRoot = path.resolve(adloRoot, "..");

const gitEnv = { ...process.env };
for (const key of Object.keys(gitEnv)) {
  if (key.startsWith("GIT_")) delete gitEnv[key];
}

function git(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", env: gitEnv });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function parseBase(argv) {
  const index = argv.indexOf("--base");
  if (index !== -1 && argv[index + 1]) return argv[index + 1];
  for (const ref of ["origin/main", "origin/HEAD"]) {
    if (!git(["rev-parse", "--verify", ref])) continue;
    const mergeBase = git(["merge-base", ref, "HEAD"]);
    if (mergeBase) return mergeBase;
  }
  return "HEAD";
}

/** 去掉 Rust 注释但保持行数不变，避免注释里的 `unsafe {` 被误判。 */
export function stripRustComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");
}

/** 返回 `unsafe {` 起始行号（1-based）。 */
export function findUnsafeStarts(text) {
  const lines = stripRustComments(text).split(/\r?\n/);
  const starts = [];
  lines.forEach((line, index) => {
    if (/\bunsafe\s*\{/.test(line)) starts.push(index + 1);
  });
  return starts;
}

/** 同行、紧邻注释块或隔空行/属性后的 `// SAFETY:` 都算已说明。 */
export function hasSafetyComment(text, lineNumber) {
  const lines = text.split(/\r?\n/);
  const index = lineNumber - 1;
  if (!lines[index]) return false;
  if (/\/\/\s*SAFETY:/.test(lines[index])) return true;

  let cursor = index - 1;
  while (cursor >= 0) {
    const line = lines[cursor];
    if (/^\s*$/.test(line) || /^\s*#\[/.test(line)) {
      cursor -= 1;
      continue;
    }
    if (/^\s*\/\//.test(line)) {
      if (/\/\/\s*SAFETY:/.test(line)) return true;
      cursor -= 1;
      continue;
    }
    break;
  }
  return false;
}

/** 解析 `git diff -U0` 的新文件行号集合。 */
export function addedLineNumbers(diff) {
  const added = new Set();
  let newLine = 0;
  for (const line of diff.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      added.add(newLine);
      newLine += 1;
    } else if (line.startsWith("-")) {
      // 删除行不占新文件行号
    } else if (!line.startsWith("\\")) {
      newLine += 1;
    }
  }
  return added;
}

function changedRustFiles(base) {
  const names = new Set();
  for (const line of git(["diff", "--name-status", "-M", base]).split(/\r?\n/)) {
    const file = line.split("\t").at(-1)?.trim();
    if (file) names.add(file);
  }
  for (const file of git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/)) {
    if (file.trim()) names.add(file.trim());
  }
  return [...names].filter((file) => file.startsWith("adlo/") && file.endsWith(".rs"));
}

function main() {
  const base = parseBase(process.argv.slice(2));
  const problems = [];
  for (const relative of changedRustFiles(base)) {
    const absolute = path.join(repoRoot, relative);
    if (!fs.existsSync(absolute)) continue;
    const text = fs.readFileSync(absolute, "utf8");
    const untracked = !git(["ls-files", "--error-unmatch", relative]);
    const added = untracked
      ? new Set(text.split(/\r?\n/).map((_, index) => index + 1))
      : addedLineNumbers(git(["diff", "-U0", base, "--", relative]));
    if (added.size === 0) continue;
    for (const line of findUnsafeStarts(text)) {
      if (added.has(line) && !hasSafetyComment(text, line)) {
        problems.push(`${relative}:${line} unsafe block missing // SAFETY: comment`);
      }
    }
  }

  if (problems.length > 0) {
    console.log(`[check-unsafe-safety] base=${base} ${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`[check-unsafe-safety] OK (base=${base})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
