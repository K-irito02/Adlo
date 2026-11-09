import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProbeExpression, parseArgs, resolveBrowserPath } from "./ui-probe.mjs";

test("parseArgs collects repeatable selectors and prop lists", () => {
  const options = parseArgs([
    "--url",
    "http://127.0.0.1:5174",
    "--selector",
    ".a",
    "--selector",
    ".b",
    "--props",
    "width, position",
    "--timeout",
    "1200",
  ]);
  assert.equal(options.url, "http://127.0.0.1:5174");
  assert.deepEqual(options.selectors, [".a", ".b"]);
  assert.deepEqual(options.props, ["width", "position"]);
  assert.equal(options.timeout, 1200);
  assert.equal(options.headless, true);
  assert.equal(options.hover, "");
});

test("parseArgs accepts a hover selector", () => {
  const options = parseArgs(["--url", "http://x", "--selector", ".target", "--hover", ".trigger"]);
  assert.equal(options.hover, ".trigger");
});

test("parseArgs rejects missing url / selectors / unknown flags", () => {
  assert.throws(() => parseArgs(["--selector", ".a"]), /--url is required/);
  assert.throws(() => parseArgs(["--url", "http://x"]), /at least one --selector/);
  assert.throws(() => parseArgs(["--url", "http://x", "--bogus"]), /unknown argument/);
});

test("buildProbeExpression embeds selector, props and pseudo", () => {
  const expression = buildProbeExpression(["#box"], ["width"], "::after");
  assert.match(expression, /"#box"/);
  assert.match(expression, /getComputedStyle/);
  assert.match(expression, /"::after"/);
  assert.doesNotThrow(() => new Function(`return ${expression}`));
});

test("resolveBrowserPath honors ADL_PROBE_BROWSER when it exists", () => {
  const previous = process.env.ADL_PROBE_BROWSER;
  process.env.ADL_PROBE_BROWSER = process.execPath;
  try {
    assert.equal(resolveBrowserPath(), process.execPath);
  } finally {
    if (previous === undefined) delete process.env.ADL_PROBE_BROWSER;
    else process.env.ADL_PROBE_BROWSER = previous;
  }
});
