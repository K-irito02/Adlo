/**
 * Ratchet guard: no **new** `as any` / `as unknown as` in store code or store tests.
 *
 * The store layer's tests seed state through `as any` casts; a rename inside the
 * store then compiles clean and only fails at runtime — which is exactly how a
 * 60-file refactor turned into a 6-round debugging loop. Existing occurrences are
 * grandfathered: this check only looks at **added lines in the staged diff**, so
 * the codebase can be cleaned up incrementally without a flag day.
 *
 * Opt-out: put `no-new-any-allow` on the added line (rare; justify in review).
 *
 * Usage: `node scripts/check-no-new-any.mjs` (pre-commit; reads the staged diff)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIFF_PATHS = ["adlo/frontend/src/app/stores"];
const BANNED = /\bas any\b|\bas unknown as\b/;

export function scanDiffText(diffText) {
  const violations = [];
  let currentFile = null;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue;
    }
    const added = line.slice(1);
    if (added.includes("no-new-any-allow")) {
      continue;
    }
    if (BANNED.test(added)) {
      violations.push({ file: currentFile ?? "<unknown>", text: added.trim().slice(0, 160) });
    }
  }
  return violations;
}

function stagedDiff() {
  try {
    return execFileSync("git", ["-C", ROOT, "diff", "--cached", "-U0", "--", ...DIFF_PATHS], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    console.error(`[check-no-new-any] failed to read staged diff: ${String(error)}`);
    process.exit(1);
  }
}

function main() {
  const violations = scanDiffText(stagedDiff());
  if (violations.length === 0) {
    console.log("[check-no-new-any] OK (no new type-erasing casts in store diff)");
    return;
  }
  console.error(`[check-no-new-any] ${violations.length} new type-erasing cast(s):`);
  for (const violation of violations) {
    console.error(`  ${violation.file}: ${violation.text}`);
  }
  console.error(
    "[check-no-new-any] Seed store state with `satisfies Partial<StoreState>` or a typed helper instead of `as any`; it erases exactly the checks that catch a broken refactor.",
  );
  process.exit(1);
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
