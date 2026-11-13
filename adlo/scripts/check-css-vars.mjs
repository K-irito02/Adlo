/**
 * CSS custom-property guard: every `var(--x)` (without a fallback) must have a
 * definition somewhere in the frontend sources.
 *
 * 背景：`var(--text-2xs)` 曾在 `settings.css` 里出现 10 次，但全仓没有定义；
 * 浏览器会静默丢弃该声明，类型检查、eslint 与 prettier 都发现不了。这里把
 * 「未定义 token」变成确定性门禁。
 *
 * 定义来源：CSS 声明（`--x:` / `@property --x`）与 TS/TSX 里以字符串形式写入的
 * 动态变量（`setProperty('--x')`、`style={{ '--x': ... }}`）。带 fallback 的
 * `var(--x, ...)` 不报。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "frontend/src");
const SCAN_EXTENSIONS = new Set([".css", ".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "coverage", "vendor"]);

/** 去掉 CSS 注释，避免把注释里的示例当成定义/使用。 */
export function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 从一段 CSS 里收集 `--x:` / `@property --x` 定义。 */
export function collectCssDefinitions(text) {
  const cleaned = stripCssComments(text);
  const names = new Set();
  for (const match of cleaned.matchAll(/(?:^|[;{]\s*)(--[a-zA-Z0-9_-]+)\s*:/g)) {
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

function main() {
  const files = collectSourceFiles();
  const defined = new Set();
  const cssFiles = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (file.endsWith(".css")) {
      cssFiles.push({ file, text });
      for (const name of collectCssDefinitions(text)) {
        defined.add(name);
      }
    } else {
      for (const name of collectScriptDefinitions(text)) {
        defined.add(name);
      }
    }
  }

  const violations = [];
  for (const { file, text } of cssFiles) {
    for (const hit of findUndefinedVars(text, defined)) {
      violations.push({
        file: path.relative(ROOT, file).replaceAll("\\", "/"),
        ...hit,
      });
    }
  }

  if (violations.length === 0) {
    console.log(`[check-css-vars] OK (${defined.size} variables defined)`);
    return;
  }
  console.error("[check-css-vars] var(--x) without definition or fallback:");
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.name}`);
  }
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
