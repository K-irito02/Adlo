/**
 * Deleted-identifier guard for maintained governance docs: identifiers removed
 * by past restructurings (deleted crates etc.) must not creep back into the
 * docs that describe the *current* repo state. Code identifiers are covered by
 * check-stale-terms.mjs (code scope); this guard covers the maintained docs.
 *
 * Scope (maintained docs only):
 *   .agents/rules/           (the editable rule source)
 *   root governance *.md    (AGENTS/README/CONTEXT/CONTRIBUTING/RULES/SKILLS/SECURITY/FUTURE-ROADMAP)
 *   adlo/AGENTS.md, adlo/README.md, adlo/CONTRIBUTING.md, adlo/public/project-design-standard.{md,html}
 *   docs/analysis/, docs/architecture/, docs/development/, docs/design-system/, docs/operations/
 *
 * Deliberately out of scope (historical records that legitimately quote old
 * names): docs/plans, docs/specs, docs/superpowers, docs/adr,
 * docs/knowledge-base, docs/root-cause-to-close, .workbuddy, .adl-logs.
 *
 * Opt-out: put `stale-term-allow` on the same line (e.g. a migration note).
 *
 * Usage: node scripts/check-deleted-crates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCAN_DIRS = [
  ".agents/rules",
  "docs/analysis",
  "docs/architecture",
  "docs/development",
  "docs/design-system",
  "docs/operations",
];
const SCAN_FILES = [
  "AGENTS.md",
  "README.md",
  "CONTEXT.md",
  "CONTRIBUTING.md",
  "RULES.md",
  "SKILLS.md",
  "SECURITY.md",
  "FUTURE-ROADMAP.md",
  "adlo/AGENTS.md",
  "adlo/README.md",
  "adlo/CONTRIBUTING.md",
  "adlo/public/project-design-standard.md",
  "adlo/public/project-design-standard.html",
];
const TEXT_FILE = /\.(md|html)$/i;

/** 已删除的标识符 → 替代写法（提示用）。 */
export const DELETED_TERMS = [
  {
    term: "dsh-bundle",
    hint: "deleted 2026-10; use crates/harness-version（版本管理）与 crates/adl-hosted（宿主版本目录）",
  },
  { term: "dsh-version", hint: "deleted 2026-10; use crates/harness-version" },
  {
    term: "adl-dsh-bundle",
    hint: "renamed/removed 2026-10; see crates/harness-version / crates/adl-hosted",
  },
  { term: "adl-dsh-version", hint: "renamed/removed 2026-10; see crates/harness-version" },
];

export function scanText(text, file = "<memory>") {
  const violations = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes("stale-term-allow")) {
      return;
    }
    for (const rule of DELETED_TERMS) {
      if (line.includes(rule.term)) {
        violations.push({
          file,
          line: index + 1,
          term: rule.term,
          hint: rule.hint,
          text: line.trim().slice(0, 160),
        });
      }
    }
  });
  return violations;
}

function walk(dirAbsolute, out) {
  if (!fs.existsSync(dirAbsolute)) {
    return;
  }
  for (const entry of fs.readdirSync(dirAbsolute, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      walk(path.join(dirAbsolute, entry.name), out);
      continue;
    }
    if (!entry.isFile() || !TEXT_FILE.test(entry.name)) {
      continue;
    }
    out.push(path.join(dirAbsolute, entry.name));
  }
}

function main() {
  const files = [];
  for (const file of SCAN_FILES) {
    const absolute = path.join(ROOT, file);
    if (fs.existsSync(absolute)) {
      files.push(absolute);
    }
  }
  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir), files);
  }

  const violations = [];
  for (const absolute of files) {
    const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
    let text;
    try {
      text = fs.readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    violations.push(...scanText(text, relative));
  }

  if (violations.length > 0) {
    console.error(`[check-deleted-crates] found ${violations.length} removed identifier(s):`);
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line}  [${violation.term}] ${violation.hint}\n    ${violation.text}`,
      );
    }
    console.error(
      "[check-deleted-crates] These names were deleted in 2026-10; update the doc to current names (or add `stale-term-allow` for an intentional historical mention).",
    );
    process.exit(1);
  }

  console.log(`[check-deleted-crates] OK (${files.length} files scanned)`);
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
