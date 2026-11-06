import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deepSelectorsAdded, extractSelectors, selectorDepth } from './lib/css-selectors.mjs';

test('extractSelectors keeps multi-line selectors and skips at-rules', () => {
  const css = `
    /* comment { fake } */
    .adl-a,
    .adl-b .adl-c {
      color: red;
    }
    @media (min-width: 10px) {
      .adl-d { color: blue; }
    }
  `;
  const selectors = [...extractSelectors(css)].sort();
  assert.deepEqual(selectors, ['.adl-a', '.adl-b .adl-c', '.adl-d']);
});

test('selectorDepth counts compounds after stripping attributes and functions', () => {
  assert.equal(selectorDepth('.adl-a'), 1);
  assert.equal(selectorDepth('.adl-a .adl-b'), 2);
  assert.equal(selectorDepth('.adl-a[data-x="1"] .adl-b:not(.c)'), 2);
  assert.equal(selectorDepth('.adl-a > .adl-b + .adl-c ~ .adl-d'), 4);
});

test('property-only edits produce no new selectors (no pseudo-selector garbage)', () => {
  const base = '.adl-center-tab-strip {\n  display: flex;\n}\n';
  const current = '.adl-center-tab-strip {\n  display: flex;\n  isolation: isolate;\n}\n';
  assert.deepEqual(deepSelectorsAdded(current, base), []);
});

test('only genuinely new deep selectors are reported', () => {
  const base = '.adl-a {\n  color: red;\n}\n.adl-b {\n  color: blue;\n}\n';
  const current =
    '.adl-a {\n  color: red;\n  isolation: isolate;\n}\n' +
    '.adl-b {\n  color: blue;\n}\n' +
    '.adl-x .adl-y > .adl-z .adl-w {\n  color: green;\n}\n';
  assert.deepEqual(deepSelectorsAdded(current, base), [
    { selector: '.adl-x .adl-y > .adl-z .adl-w', depth: 4 },
  ]);
});
