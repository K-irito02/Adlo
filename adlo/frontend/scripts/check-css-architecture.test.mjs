import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blankComments, findViolations, keyframeLines } from './check-css-architecture.mjs';

const added = (lines) =>
  lines.map((raw, index) => ({ line: index + 1, raw, text: blankComments(raw) }));

describe('blankComments', () => {
  it('blanks block comments but keeps line count', () => {
    const text = 'a /* x\ny */ b';
    const blanked = blankComments(text);
    assert.equal(blanked.split('\n').length, 2);
    assert.ok(!blanked.includes('x'));
    assert.ok(blanked.includes('a '));
  });
});

describe('keyframeLines', () => {
  it('marks lines inside @keyframes only', () => {
    const css = ['@keyframes a {', '  from { opacity: 0; }', '}', '.b { color: red; }'].join('\n');
    const lines = keyframeLines(blankComments(css));
    assert.ok(lines.has(1));
    assert.ok(lines.has(2));
    assert.ok(!lines.has(4));
  });
});

describe('findViolations', () => {
  const css = [
    '@keyframes a {',
    '  from { width: 1px; }',
    '  to { transform: scale(1); }',
    '}',
    '.x * { color: red !important; }',
  ].join('\n');
  const all = added(css.split('\n'));

  it('flags non-transform keyframe properties', () => {
    const problems = findViolations(blankComments(css), all);
    assert.equal(problems.filter((p) => p.rule === 'animation-property').length, 1);
  });

  it('flags universal selectors and !important on the same line', () => {
    const rules = findViolations(blankComments(css), all).map((p) => p.rule);
    assert.deepEqual(
      rules.filter((r) => r !== 'animation-property'),
      ['universal-selector', 'important'],
    );
  });

  it('accepts line-level allow markers', () => {
    const marked = [
      '@keyframes a {',
      '  from { width: 1px; /* animation-prop-allow: demo */ }',
      '}',
      '.x * { color: red !important; } /* selector-allow important-allow */',
    ].join('\n');
    const problems = findViolations(blankComments(marked), added(marked.split('\n')));
    assert.deepEqual(problems, []);
  });

  it('ignores markers only when they are on the offending line', () => {
    const mixed = [
      '/* animation-prop-allow: 别处 */',
      '@keyframes a {',
      '  from { width: 1px; }',
      '}',
    ].join('\n');
    const problems = findViolations(blankComments(mixed), added(mixed.split('\n')));
    assert.equal(problems.length, 1);
    assert.equal(problems[0].rule, 'animation-property');
  });
});
