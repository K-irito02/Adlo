/**
 * CSS custom-property guard:
 * 1) every `var(--x)` (without a fallback) must have a definition somewhere in the
 *    frontend sources;
 * 2) every **newly added** definition in a changed CSS file must be consumed by at
 *    least one `var(--x)` (CSS) or quoted `'--x'` reference (TS/TSX). This catches
 *    "designed a token, forgot to wire it" — e.g. the rejected `--landing-volume-accent`
 *    that only review noticed. Historical definitions are out of scope; the check is
 *    limited to changed files, same policy as `check-dead-code`.
 *
 * 背景：`var(--text-2xs)` 曾在 `settings.css` 里出现 10 次，但全仓没有定义；
 * 浏览器会静默丢弃该声明，类型检查、eslint 与 prettier 都发现不了。这里把
 * 「未定义 token」与「新增未消费 token」都变成确定性门禁。
 *
 * 定义来源：CSS 声明（`--x:` / `@property --x`）与 TS/TSX 里以字符串形式写入的
 * 动态变量（`setProperty('--x')`、`style={{ '--x': ... }}`）。带 fallback 的
 * `var(--x, ...)` 不报未定义，但会计入「被消费」。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "frontend/src");
const SCAN_EXTENSIONS = new Set([".css", ".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "coverage", "vendor"]);

/** git hook 注入的 GIT_* 会改变 cwd/index 语义；统一剥离后由脚本自己指定 cwd。 */
const gitEnv = { ...process.env };
for (const key of Object.keys(gitEnv)) {
  if (key.startsWith("GIT_")) delete gitEnv[key];
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", env: gitEnv });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

/** 去掉 CSS 注释，避免把注释里的示例当成定义/使用。 */
export function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 从一段 CSS 里收集 `--x:` / `@property --x` 定义。 */
export function collectCssDefinitions(text) {
  const cleaned = stripCssComments(text);
  const names = new Set();
  for (const match of cleaned.matchAll(/(?:^|[;{])\s*(--[a-zA-Z0-9_-]+)\s*:/gm)) {
    names.add(match[1]);
  }
  for (const match of cleaned.matchAll(/@property\s+(--[a-zA-Z0-9_-]+)/g)) {
    names.add(match[1]);
  }
  return names;
}

/** 从 TS/TSX 等脚本里收集以字符串形式出现的动态变量名。 */
export function collectScriptDefinitions(text) {
  const names = new Set();
  for (const match of text.matchAll(/['"](--[a-zA-Z0-9_-]+)['"]/g)) {
    names.add(match[1]);
  }
  return names;
}

/** 收集 CSS 里所有 `var(--x)` 引用（含带 fallback 的写法）。 */
export function collectCssUsages(text) {
  const cleaned = stripCssComments(text);
  const names = new Set();
  for (const match of cleaned.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * 找出没有定义、且没有 fallback 的 `var(--x)`。
 * 返回 [{ name, line }]，行号从 1 开始。
 */
export function findUndefinedVars(cssText, defined) {
  const cleaned = stripCssComments(cssText);
  const violations = [];
  for (const match of cleaned.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(,?)/g)) {
    const [, name, comma] = match;
    if (comma === ",") {
      continue;
    }
    if (defined.has(name)) {
      continue;
    }
    const line = cleaned.slice(0, match.index ?? 0).split("\n").length;
    violations.push({ name, line });
  }
  return violations;
}

/**
 * 本次新增、但全仓没有任何消费方的 token 定义。
 * `baseText` 为空表示新文件；`used` 由全仓 CSS `var()` 与 TS 字符串引用汇总。
 * `allowed` 来自同行的 `token-allow` 标记（例如仅供第三方消费的主题变量）。
 */
export function findUnusedDefinitions(currentText, baseText, used, allowed = new Set()) {
  const current = collectCssDefinitions(currentText);
  const base = collectCssDefinitions(baseText);
  return [...current].filter((name) => !base.has(name) && !used.has(name) && !allowed.has(name));
}

/** 收集带 `token-allow` 标记的定义名（标记可在定义行或紧邻的上一行注释）。 */
export function collectAllowedDefinitions(text) {
  const allowed = new Set();
  const lines = stripCssComments(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("token-allow")) continue;
    for (const name of collectCssDefinitions(lines[index])) allowed.add(name);
    const next = lines[index + 1];
    if (next) {
      for (const name of collectCssDefinitions(next)) allowed.add(name);
    }
  }
  // token-allow 写在注释里时 stripCssComments 会删掉整行，改从原文重扫一次。
  const rawLines = text.split(/\r?\n/);
  for (let index = 0; index < rawLines.length; index += 1) {
    if (!rawLines[index].includes("token-allow")) continue;
    const next = rawLines[index + 1];
    if (next) {
      for (const name of collectCssDefinitions(next)) allowed.add(name);
    }
  }
  return allowed;
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), out);
      }
      continue;
    }
    if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
}

function collectSourceFiles() {
  const files = [];
  walk(SRC_DIR, files);
  return files.sort();
}

/** 变更基线：优先 origin/main 的 merge-base，避免把已合入 main 的改动算成本次新增。 */
function resolveBase() {
  for (const ref of ["origin/main", "origin/HEAD"]) {
    if (!git(["rev-parse", "--verify", ref])) continue;
    const mergeBase = git(["merge-base", ref, "HEAD"]);
    if (mergeBase) return mergeBase;
  }
  return "HEAD";
}

/** 本次变更的 CSS 绝对路径（含未跟踪文件）。 */
function changedCssFiles(base) {
  const names = new Set();
  const diff = git(["diff", "--name-status", "-M", base]);
  for (const line of diff.split(/\r?\n/)) {
    const parts = line.split("\t");
    const file = parts.at(-1)?.trim();
    if (file) names.add(file);
  }
  for (const file of git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/)) {
    if (file.trim()) names.add(file.trim());
  }
  return [...names]
    .map((file) => path.resolve(ROOT, file))
    .filter((file) => file.startsWith(SRC_DIR) && file.endsWith(".css") && fs.existsSync(file));
}

function main() {
  const files = collectSourceFiles();
  const defined = new Set();
  const used = new Set();
  const cssFiles = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (file.endsWith(".css")) {
      cssFiles.push({ file, text });
      for (const name of collectCssDefinitions(text)) {
        defined.add(name);
      }
      for (const name of collectCssUsages(text)) {
        used.add(name);
      }
    } else {
      for (const name of collectScriptDefinitions(text)) {
        defined.add(name);
        used.add(name);
      }
    }
  }

  const violations = [];
  for (const { file, text } of cssFiles) {
    for (const hit of findUndefinedVars(text, defined)) {
      violations.push({
        file: path.relative(ROOT, file).replaceAll("\\", "/"),
        ...hit,
        reason: "var() without definition or fallback",
      });
    }
  }

  if (git(["rev-parse", "--show-toplevel"])) {
    const base = resolveBase();
    for (const file of changedCssFiles(base)) {
      const relative = path.relative(ROOT, file).split(path.sep).join("/");
      const baseText = git(["show", `${base}:${relative}`]);
      const currentText = fs.readFileSync(file, "utf8");
      const allowed = collectAllowedDefinitions(currentText);
      for (const name of findUnusedDefinitions(currentText, baseText, used, allowed)) {
        violations.push({
          file: relative,
          line: 0,
          name,
          reason: "new token has no var()/quoted consumer",
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log(`[check-css-vars] OK (${defined.size} variables defined)`);
    return;
  }
  console.error("[check-css-vars] CSS token violations:");
  for (const violation of violations) {
    const location = violation.line > 0 ? `:${violation.line}` : "";
    console.error(`  ${violation.file}${location}  ${violation.name}  (${violation.reason})`);
  }
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
