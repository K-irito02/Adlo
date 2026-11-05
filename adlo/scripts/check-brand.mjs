/**
 * Brand-name guard: the product is `Adlo`; legacy names must not leak back into
 * current sources or docs.
 *
 * Excluded (historical records / external material):
 *   branding/, references/, .workbuddy/, docs/plans/, docs/root-cause-to-close/
 * Historical files inside otherwise-scanned trees can opt out explicitly with
 * `brand-allow-file` in the first five lines; individual lines may use `brand-allow`.
 *
 * Usage: `node scripts/check-brand.mjs`
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const EXCLUDED_DIRS = new Set([
  ".git",
  ".codegraph",
  ".adl-logs",
  "node_modules",
  "target",
  "branding",
  "references",
  ".workbuddy",
]);
const EXCLUDED_PREFIXES = ["docs/plans/", "docs/root-cause-to-close/"];
const SELF_FILES = new Set(["adlo/scripts/check-brand.mjs", "adlo/scripts/check-brand.test.mjs"]);
const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|rs|md|json|toml|css|html|ya?ml|ps1|sh)$/i;

const RULES = [
  { name: "AIDigitalLife", pattern: /\bAIDigitalLife\b/g },
  { name: "Kora", pattern: /\bKora\b/gi },
  { name: "可燃", pattern: /可燃/g },
];

export function scanText(text, file = "<memory>") {
  const lines = text.split(/\r?\n/);
  const fileAllowed = lines.slice(0, 5).some((line) => line.includes("brand-allow-file"));
  if (fileAllowed) {
    return [];
  }
  const violations = [];
  lines.forEach((line, index) => {
    if (line.includes("brand-allow")) {
      return;
    }
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(line)) {
        continue;
      }
      violations.push({
        file,
        line: index + 1,
        term: rule.name,
        text: line.trim().slice(0, 160),
      });
    }
  });
  return violations;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile() || !TEXT_FILE.test(entry.name)) {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(ROOT, absolute).replace(/\\/g, "/");
    if (SELF_FILES.has(relative)) {
      continue;
    }
    if (EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix))) {
      continue;
    }
    out.push({ absolute, relative });
  }
}

function main() {
  const files = [];
  walk(ROOT, files);

  const violations = [];
  for (const { absolute, relative } of files) {
    let text;
    try {
      text = fs.readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    violations.push(...scanText(text, relative));
  }

  if (violations.length > 0) {
    console.error(`[check-brand] found ${violations.length} legacy brand reference(s):`);
    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line}  [${violation.term}] ${violation.text}`);
    }
    console.error(
      "[check-brand] Use `Adlo` in current sources/docs; historical files need `brand-allow-file`.",
    );
    process.exit(1);
  }

  console.log(`[check-brand] OK (${files.length} files scanned)`);
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
