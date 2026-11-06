/**
 * UI 手册选择器漂移检查：手册里写的 class / aria-label 必须仍存在于代码。
 *
 * 背景：`docs/operations/ui-manual/**` 是自动化用例的选择器来源，但长期无人校验，
 * 出现过 `.adl-titlebar__drag`（实际已改名）、已删除的主题/语言按钮等失效引用。
 *
 * 口径：
 * - class：`.adl-*` 必须出现在 `frontend/src/**` 的 TS/TSX/CSS 中；
 * - aria-label：`aria-label="X"` 必须在 zh-CN / en-US 字典的字符串值中找到 X；
 *   `aria-label*="X"` 按子串匹配。
 * - 单行含 `ui-manual-allow` 的引用跳过（用于明确的历史/规划页）。
 *
 * 用法：`node scripts/check-ui-manual-selectors.mjs`（已挂入 check:repo）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../..");
export const docsRoot = path.join(repoRoot, "docs/operations/ui-manual");
export const srcRoot = path.join(repoRoot, "adlo/frontend/src");
const i18nRoot = path.join(srcRoot, "app/i18n");
const baselinePath = path.join(here, "ui-manual-selectors.baseline.json");

export const ALLOW_MARKER = "ui-manual-allow";

function walk(dir, extensions, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, extensions, out);
    } else if (extensions.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** `.adl-*` token 及其行号。 */
export function extractClassTokens(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(/\.(adl-[a-z0-9_-]+)/g)) {
      out.push({ name: match[1], line: index + 1, raw: line });
    }
  }
  return out;
}

/** `aria-label="X"` / `aria-label*="X"` 及其行号。 */
export function extractAriaSelectors(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(/aria-label(=|\*=)"([^"]+)"/g)) {
      out.push({ label: match[2], exact: match[1] === "=", line: index + 1, raw: line });
    }
  }
  return out;
}

/** 源码中出现的全部 adl-* class（含 TSX className 与 CSS 选择器）。 */
export function collectKnownClasses() {
  const known = new Set();
  for (const file of walk(srcRoot, [".ts", ".tsx", ".css"])) {
    if (/__tests__|\.test\./.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/adl-[a-z0-9_-]+/g)) {
      known.add(match[0]);
    }
  }
  return known;
}

/** 字典里的全部字符串值（用于 aria-label 文本校验）。 */
export function collectKnownStrings() {
  const values = [];
  for (const file of walk(i18nRoot, [".ts"])) {
    if (/__tests__|\.test\./.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/'([^'\\\n]+)'|"([^"\\\n]+)"/g)) {
      values.push(match[1] ?? match[2]);
    }
  }
  return values;
}

export function checkManual(files, knownClasses, knownStrings) {
  const problems = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const token of extractClassTokens(text)) {
      if (token.raw.includes(ALLOW_MARKER)) continue;
      if (!knownClasses.has(token.name)) {
        problems.push({
          file,
          line: token.line,
          message: `class ".${token.name}" does not exist in frontend/src`,
        });
      }
    }
    for (const aria of extractAriaSelectors(text)) {
      if (aria.raw.includes(ALLOW_MARKER)) continue;
      const found = aria.exact
        ? knownStrings.includes(aria.label)
        : knownStrings.some((value) => value.includes(aria.label));
      if (!found) {
        problems.push({
          file,
          line: aria.line,
          message: `aria-label "${aria.label}" does not exist in zh-CN / en-US dictionaries`,
        });
      }
    }
  }
  return problems;
}

/** 基线键不含行号：文档增删行不会让整份基线失效。 */
export function problemKey(problem) {
  const absolute = path.isAbsolute(problem.file) ? problem.file : path.join(repoRoot, problem.file);
  const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
  return `${relative} :: ${problem.message}`;
}

export function splitByBaseline(problems, baselineEntries) {
  const known = new Set(baselineEntries);
  return {
    fresh: problems.filter((problem) => !known.has(problemKey(problem))),
    baselined: problems.filter((problem) => known.has(problemKey(problem))),
  };
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

function main() {
  if (!fs.existsSync(docsRoot)) {
    console.log("[check:ui-manual] no docs/operations/ui-manual; skipped");
    return;
  }
  const files = walk(docsRoot, [".md"]);
  const problems = checkManual(files, collectKnownClasses(), collectKnownStrings());

  if (process.argv.includes("--update-baseline")) {
    const entries = [...new Set(problems.map(problemKey))].sort();
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          note: "历史漂移基线：仅用于阻止新增漂移；清理后请重跑 --update-baseline 收缩。",
          entries,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(
      `[check:ui-manual] baseline updated (${entries.length} entries) -> ${path.relative(repoRoot, baselinePath)}`,
    );
    return;
  }

  const strict = process.argv.includes("--strict");
  const baseline = loadBaseline();
  const { fresh, baselined } = strict
    ? { fresh: problems, baselined: [] }
    : splitByBaseline(problems, baseline);

  if (fresh.length > 0) {
    console.log(`[check:ui-manual] ${fresh.length} new stale selector(s):`);
    for (const problem of fresh) {
      console.log(`  ${path.relative(repoRoot, problem.file)}:${problem.line} ${problem.message}`);
    }
    console.log(
      `\n[check:ui-manual] ${baselined.length} known historical drift(s) are baselined; fix them or rerun --update-baseline.`,
    );
    process.exit(1);
  }
  console.log(`[check:ui-manual] OK (${files.length} manual files, ${baselined.length} baselined)`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
