#!/usr/bin/env node
/**
 * Dev-tooling lint: `adlo/scripts/*.mjs` sits outside the frontend ESLint/tsc
 * scope, so merge mistakes like duplicate `case` labels or object keys pass
 * `node --check`. Run ESLint's parser-only rules on those files.
 *
 * Usage:
 *   node scripts/check-script-lint.mjs [files...]   # default: adlo/scripts/*.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const requireFromFrontend = createRequire(path.join(repoRoot, "adlo/frontend/package.json"));
const { Linter } = requireFromFrontend("eslint");
const linter = new Linter();

const LINT_CONFIG = {
  rules: {
    "no-duplicate-case": "error",
    "no-dupe-keys": "error",
  },
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
};

/** Lint one source string; returns ESLint messages (empty when clean). */
export function lintSource(code, filename = "inline.mjs") {
  return linter.verify(code, LINT_CONFIG, filename);
}

function defaultFiles() {
  const dirs = [path.join(repoRoot, "adlo/scripts"), path.join(repoRoot, "adlo/frontend/scripts")];
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".mjs")) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files.sort();
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const files = args.length > 0 ? args.map((file) => path.resolve(file)) : defaultFiles();
  let failed = 0;

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`[script-lint] missing file: ${file}`);
      failed += 1;
      continue;
    }
    const code = fs.readFileSync(file, "utf8");
    const messages = lintSource(code, file);
    for (const message of messages) {
      console.error(
        `[script-lint] ${path.relative(repoRoot, file)}:${message.line}:${message.column} ${message.message} (${message.ruleId})`,
      );
      failed += 1;
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log(`[script-lint] OK (${files.length} file(s))`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`[script-lint] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
