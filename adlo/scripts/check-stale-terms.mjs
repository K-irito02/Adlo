/**
 * Stale-identifier guard: identifiers removed by a refactor must not creep back
 * into current sources. `tsc` cannot see string keys, mock method names or
 * type-erased casts, so a half-finished rename can compile and still be wrong.
 *
 * Scope: code only (`adlo/frontend/src`, `adlo/frontend/dev`, `adlo/src-tauri/src`).
 * Docs are deliberately excluded — ADRs and plans quote old names on purpose.
 *
 * Opt-out: put `stale-term-allow` on the same line (e.g. a migration note).
 *
 * Usage: `node scripts/check-stale-terms.mjs`
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCAN_DIRS = ["adlo/frontend/src", "adlo/frontend/dev", "adlo/src-tauri/src"];
const EXCLUDED_DIRS = new Set([".git", ".codegraph", "node_modules", "target", "dist"]);
const SELF_FILES = new Set([
  "adlo/scripts/check-stale-terms.mjs",
  "adlo/scripts/check-stale-terms.test.mjs",
]);
const TEXT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|rs|json|toml|css|html|ya?ml)$/i;

/** 已删除的标识符 → 替代写法（提示用）。 */
export const STALE_TERMS = [
  { term: "BookmarkTabItem", hint: "use BookmarkEntry" },
  { term: "TabFolderState", hint: "use BookmarkFolder (field: entries)" },
  { term: "TabFolderStateUpdate", hint: "use BookmarkFolderUpdate" },
  { term: "WorkspaceBookmarkEntry", hint: "use BookmarkEntry" },
  { term: "browserTabFolders", hint: "use browserBookmarkFolders" },
  { term: "browserBookmarkTabIdUrlMap", hint: "removed; entries carry url/iconUri themselves" },
  { term: "adl:browser.tabFolders", hint: "use adl:browser.bookmarkFolders" },
  { term: "adl:browser.tabIdUrlMap", hint: "removed" },
  { term: "clipboard_save_to_file", hint: "use app_save_file (fileSave domain)" },
  { term: "createBrowserFoldersSlice", hint: "use createBrowserBookmarkFoldersSlice" },
];

export function scanText(text, file = "<memory>") {
  const violations = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes("stale-term-allow")) {
      return;
    }
    for (const rule of STALE_TERMS) {
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
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      walk(path.join(dirAbsolute, entry.name), out);
      continue;
    }
    if (!entry.isFile() || !TEXT_FILE.test(entry.name)) {
      continue;
    }
    const absolute = path.join(dirAbsolute, entry.name);
    const relative = path.relative(ROOT, absolute).replace(/\\/g, "/");
    if (SELF_FILES.has(relative)) {
      continue;
    }
    out.push({ absolute, relative });
  }
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir), files);
  }

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
    console.error(`[check-stale-terms] found ${violations.length} removed identifier(s):`);
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line}  [${violation.term}] ${violation.hint}\n    ${violation.text}`,
      );
    }
    console.error(
      "[check-stale-terms] These names were removed by a refactor; use the replacement (or add `stale-term-allow` for an intentional mention).",
    );
    process.exit(1);
  }

  console.log(`[check-stale-terms] OK (${files.length} files scanned)`);
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
