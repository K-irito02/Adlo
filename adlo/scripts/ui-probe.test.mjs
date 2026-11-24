import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClickExpressions,
  buildProbeExpression,
  parseArgs,
  resolveBrowserPath,
} from "./ui-probe.mjs";

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

test("parseArgs collects click steps and a prelude for panel-gated UI", () => {
  const options = parseArgs([
    "--url",
    "http://x",
    "--selector",
    ".adl-about__links",
    "--click",
    'button[aria-label="设置"]',
    "--click",
    ".adl-settings-nav__item",
    "--eval",
    "document.title",
    "--settle",
    "0",
  ]);
  assert.deepEqual(options.clicks, ['button[aria-label="设置"]', ".adl-settings-nav__item"]);
  assert.equal(options.prelude, "document.title");
  assert.equal(options.settle, 0);
  // 默认值：不点击、不执行前置脚本、点击后等 300ms 让 React 完成渲染。
  const defaults = parseArgs(["--url", "http://x", "--selector", ".a"]);
  assert.deepEqual(defaults.clicks, []);
  assert.equal(defaults.prelude, "");
  assert.equal(defaults.settle, 300);
});

test("parseArgs separates navigation-time and post-load evaluations", () => {
  const options = parseArgs([
    "--url",
    "http://x",
    "--selector",
    ".probe",
    "--eval",
    "window.__early = 1",
    "--eval-when",
    "#app > *",
    "--eval-after-load",
    "document.body.append(document.createElement('div'))",
  ]);
  assert.equal(options.prelude, "window.__early = 1");
  assert.equal(options.evalWhen, "#app > *");
  assert.equal(options.afterLoad, "document.body.append(document.createElement('div'))");
  // 默认不等待、不注入，保持原有 --eval 语义。
  const defaults = parseArgs(["--url", "http://x", "--selector", ".a"]);
  assert.equal(defaults.afterLoad, "");
  assert.equal(defaults.evalWhen, "");
});

test("parseArgs accepts theme, focus, and viewport overrides", () => {
  const options = parseArgs([
    "--url",
    "http://x",
    "--selector",
    ".a",
    "--theme",
    "light",
    "--focus",
    ".adl-clipboard__clear",
    "--viewport",
    "720x900",
  ]);
  assert.equal(options.theme, "light");
  assert.equal(options.focus, ".adl-clipboard__clear");
  assert.equal(options.viewport, "720x900");
  const defaults = parseArgs(["--url", "http://x", "--selector", ".a"]);
  assert.equal(defaults.theme, "");
  assert.equal(defaults.focus, "");
  assert.equal(defaults.viewport, "");
});

test("parseArgs validates theme and viewport values", () => {
  assert.throws(
    () => parseArgs(["--url", "http://x", "--selector", ".a", "--theme", "auto"]),
    /--theme/,
  );
  assert.throws(
    () => parseArgs(["--url", "http://x", "--selector", ".a", "--viewport", "720"]),
    /--viewport/,
  );
});

test("parseArgs rejects missing url / selectors / unknown flags", () => {
  assert.throws(() => parseArgs(["--selector", ".a"]), /--url is required/);
  assert.throws(() => parseArgs(["--url", "http://x"]), /at least one --selector/);
  assert.throws(() => parseArgs(["--url", "http://x", "--bogus"]), /unknown argument/);
});

test("buildClickExpressions supports CSS selectors and text= targets", () => {
  const css = buildClickExpressions('button[aria-label="设置"]');
  assert.match(css.exists, /document\.querySelector/);
  assert.match(css.click, /\.click\(\)/);
  assert.doesNotThrow(() => new Function(`return ${css.click}`));

  const text = buildClickExpressions("text=关于");
  assert.match(text.exists, /textContent/);
  assert.match(text.exists, /"关于"/);
  assert.doesNotThrow(() => new Function(`return ${text.click}`));
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
