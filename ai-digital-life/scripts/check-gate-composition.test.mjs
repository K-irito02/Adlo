import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("check:all includes the full frontend gate (static + tests)", () => {
  assert.match(pkg.scripts["check:all"], /frontend:check:full/);
  assert.equal(pkg.scripts["frontend:check:full"], "pnpm --dir frontend run check:full");
});

test("check:all still runs the cargo gates", () => {
  for (const gate of ["cargo:fmt:check", "cargo:clippy", "cargo:check", "cargo:test"]) {
    assert.match(pkg.scripts["check:all"], new RegExp(gate));
  }
});

test("daily check:changed wires affected Rust tests and accepts --base", () => {
  const text = readFileSync(
    new URL("../frontend/scripts/check-changed.mjs", import.meta.url),
    "utf8",
  );
  assert.match(text, /check-rust-changed\.mjs/);
  assert.match(text, /--base/);
});
