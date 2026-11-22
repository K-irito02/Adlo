import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FRONTEND = fileURLToPath(new URL("../frontend/", import.meta.url));

function prettierVersion(baseDir) {
  const pkgPath = `${baseDir}node_modules/prettier/package.json`;
  assert.ok(existsSync(pkgPath), `prettier is not installed at ${pkgPath}`);
  return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

test("root and frontend resolve the same Prettier version", () => {
  // pre-commit 的 lint-staged 用根 Prettier，check:changed / eslint 用前端 Prettier。
  // 两个版本一旦漂移，hook 与门禁会互相改写同一文件（2026-11-23 实测）。
  assert.equal(
    prettierVersion(ROOT),
    prettierVersion(FRONTEND),
    "align package.json prettier versions (root vs adlo/frontend)",
  );
});
