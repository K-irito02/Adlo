import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the release boundary of the opt-in desktop E2E harness.
 *
 * The e2e build reuses the production app, so two classes of regression are
 * silent until a user installs a build: the `e2e` feature leaking into default
 * features, or the e2e-only Tauri config leaking into production. These checks
 * are cheap and run in pre-commit.
 */

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(appRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(join(appRoot, relativePath), "utf8");
}

const productionConfig = readJson("src-tauri/tauri.conf.json");
const e2eConfig = readJson("e2e/tauri.e2e.conf.json");
const packageJson = readJson("package.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const mainRs = readText("src-tauri/src/main.rs");
const mainTsx = readFileSync(join(appRoot, "frontend/src/main.tsx"), "utf8");

test("production Tauri config keeps withGlobalTauri disabled", () => {
  assert.equal(
    productionConfig.app.withGlobalTauri,
    false,
    "production tauri.conf.json must not enable withGlobalTauri",
  );
});

test("e2e Tauri config stays isolated from production", () => {
  assert.notEqual(
    e2eConfig.identifier,
    productionConfig.identifier,
    "e2e identifier must differ from production (data isolation)",
  );
  assert.equal(
    e2eConfig.app.withGlobalTauri,
    true,
    "e2e config needs withGlobalTauri for the WDIO guest plugin",
  );
  assert.match(
    e2eConfig.build?.beforeBuildCommand ?? "",
    /--mode e2e/,
    "e2e build must use the e2e frontend mode",
  );
});

test("the e2e cargo feature is opt-in and env-gated", () => {
  const defaultFeatures = cargoToml.match(/^default\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
  assert.ok(defaultFeatures, "src-tauri/Cargo.toml is missing a default feature list");
  assert.doesNotMatch(
    defaultFeatures,
    /"e2e"/,
    "the e2e feature must never be part of default features",
  );
  assert.match(
    mainRs,
    /#\[cfg\(feature = "e2e"\)\][\s\S]{0,400}TAURI_WEBDRIVER_PORT/,
    "WDIO plugins must be compiled conditionally and registered only when TAURI_WEBDRIVER_PORT is set",
  );
});

test("the e2e frontend bridge is loaded only in e2e builds", () => {
  assert.match(
    mainTsx,
    /import\.meta\.env\.VITE_ADL_E2E/,
    "main.tsx must gate the WDIO guest plugin behind VITE_ADL_E2E",
  );
  assert.match(
    mainTsx,
    /import\(["']@wdio\/tauri-plugin["']\)/,
    "main.tsx must load @wdio/tauri-plugin dynamically so production builds tree-shake it",
  );
});

test("check:all never launches the desktop E2E suite", () => {
  const checkAll = packageJson.scripts?.["check:all"] ?? "";
  assert.ok(checkAll, "package.json is missing check:all");
  assert.doesNotMatch(
    checkAll,
    /(^|[\s&|])e2e([\s:&|]|$)/,
    "check:all must not include the GUI-launching e2e suite",
  );
});

test("capability files do not use wildcard permissions", () => {
  const capabilityDir = join(appRoot, "src-tauri/capabilities");
  for (const file of readdirSync(capabilityDir).filter((name) => name.endsWith(".json"))) {
    const capability = readJson(join("src-tauri/capabilities", file));
    for (const permission of capability.permissions ?? []) {
      assert.notEqual(permission, "all", `${file}: wildcard permission "all"`);
      assert.doesNotMatch(permission, /\*\*/, `${file}: wildcard permission "${permission}"`);
      assert.doesNotMatch(permission, /:all$/, `${file}: wildcard permission "${permission}"`);
    }
  }
});
