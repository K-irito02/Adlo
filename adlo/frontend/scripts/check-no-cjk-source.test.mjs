import test from 'node:test';
import assert from 'node:assert/strict';
import { bareCjkLines, parseAddedLines } from './check-no-cjk-source.mjs';

test('masks single-line and block comments but keeps CJK in strings and JSX text', () => {
  const text = [
    '// 中文注释',
    "const a = '新建项目'; // 中文注释",
    '/* 中文块注释 */',
    '/* 多行\n中文块注释 */',
    'const b = (<span>提交</span>) as string;',
    'const c = `新建 ${name} 项目`;',
  ].join('\n');
  const hits = [...bareCjkLines(text)].sort((a, b) => a - b);
  assert.deepEqual(hits, [2, 6, 7]);
});

test('line comments with CJK are masked', () => {
  const text = '// 中文注释\nconst x = 1;';
  assert.deepEqual([...bareCjkLines(text)], []);
});

test('empty source produces no hits', () => {
  assert.deepEqual([...bareCjkLines('')], []);
});

test('parseAddedLines maps additions to new-file line numbers', () => {
  const diff = [
    '@@ -1,2 +10,3 @@',
    '-old',
    '+one',
    '+two',
    ' context',
    '+three',
    '+++ b/x',
    '--- a/x',
    '\\ no newline at end of file',
  ].join('\n');
  assert.deepEqual(parseAddedLines(diff), [
    { line: 10, text: 'one' },
    { line: 11, text: 'two' },
    { line: 13, text: 'three' },
  ]);
});
