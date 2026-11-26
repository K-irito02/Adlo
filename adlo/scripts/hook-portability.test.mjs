import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Husky hooks run under whatever shell Git hands them (Git Bash / MSYS on
 * Windows, sh on macOS and Linux). GNU/MSYS `xargs` aborts during startup when
 * the computed arg_max is smaller than LINE_MAX — `assertion
 * "bc_ctl.arg_max >= LINE_MAX" failed` — which turns a normal commit into a
 * hard failure with a message that points at xargs, not at the hook.
 *
 * The hooks are the repo's only guardrail (there is no CI), so a hook that
 * dies on its own plumbing blocks every commit. Keep them on plain shell.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const hooksDir = join(repoRoot, ".husky");

function hookFiles() {
  return readdirSync(hooksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

test("husky hooks do not call xargs", () => {
  const offenders = [];
  for (const name of hookFiles()) {
    const lines = readFileSync(join(hooksDir, name), "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const code = line.trim();
      // 注释里说明「为什么不用 xargs」是允许的
      if (code.startsWith("#")) {
        return;
      }
      if (/(^|[\s|;(])xargs(\s|$)/.test(code)) {
        offenders.push(`${name}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "husky hooks must batch arguments with shell loops; xargs aborts on MSYS (bc_ctl.arg_max)",
  );
});
