import { describe, expect, it } from 'vitest';
import {
  createGitignoreMatcher,
  ignoreCheckStateOf,
  isSearchPathExcluded,
  toggleIgnoredPath,
} from '../searchIgnore';

/**
 * 检索忽略匹配器（与 Rust `crates/workspace/src/gitignore.rs` 镜像语义，
 * 用例逐项对照：文件名/行为一致，任一侧改动都会在各自测试里失败）。
 */
describe('isSearchPathExcluded', () => {
  it('matches exact paths and everything below an ignored directory', () => {
    expect(isSearchPathExcluded('a/b.md', ['a/b.md'])).toBe(true);
    expect(isSearchPathExcluded('a/b/c.md', ['a'])).toBe(true);
    expect(isSearchPathExcluded('a.md', ['a.md'])).toBe(true);
  });

  it('does not match mere string prefixes', () => {
    expect(isSearchPathExcluded('abc.md', ['ab'])).toBe(false);
    expect(isSearchPathExcluded('a2/b.md', ['a'])).toBe(false);
  });

  it('normalizes backslashes and tolerates empty entries', () => {
    expect(isSearchPathExcluded('a\\b.md', ['a/b.md'])).toBe(true);
    expect(isSearchPathExcluded('a/b.md', ['', 'a/b.md'])).toBe(true);
    expect(isSearchPathExcluded('a/b.md', [])).toBe(false);
  });
});

describe('ignoreCheckStateOf / toggleIgnoredPath', () => {
  it('reports checked, partial (dot), and unchecked', () => {
    expect(ignoreCheckStateOf('a', ['a/b.md'])).toBe('partial');
    expect(ignoreCheckStateOf('a/b.md', ['a/b.md'])).toBe('checked');
    expect(ignoreCheckStateOf('a', ['a'])).toBe('checked');
    expect(ignoreCheckStateOf('a/b.md', ['a'])).toBe('checked');
    expect(ignoreCheckStateOf('c.md', ['a'])).toBe('unchecked');
  });

  it('keeps the list minimal when toggling', () => {
    expect(toggleIgnoredPath('a', [])).toEqual(['a']);
    // 新增目录时去掉被覆盖的后代条目。
    expect(toggleIgnoredPath('a', ['a/b.md', 'c.md'])).toEqual(['c.md', 'a']);
    // 取消时连带清理后代条目。
    expect(toggleIgnoredPath('a', ['a', 'a/b.md', 'c.md'])).toEqual(['c.md']);
    // 仅被祖先覆盖（自身不在名单中）：追加显式条目，过滤语义不变
    //（UI 层对这种情况走祖先展开，不直接调本函数）。
    expect(toggleIgnoredPath('a/b.md', ['a'])).toEqual(['a', 'a/b.md']);
  });
});

describe('createGitignoreMatcher', () => {
  it('ignores blank lines and comments, matches globs case-sensitively', () => {
    const match = createGitignoreMatcher([{ baseDir: '', content: '# comment\n\n*.log\n' }]);
    expect(match('a.log', false)).toBe(true);
    expect(match('sub/b.log', false)).toBe(true);
    expect(match('a.LOG', false)).toBe(false);
    expect(match('a.md', false)).toBe(false);
  });

  it('treats trailing-slash patterns as directories including their contents', () => {
    const match = createGitignoreMatcher([{ baseDir: '', content: 'build/\n' }]);
    expect(match('build', true)).toBe(true);
    expect(match('build/out.js', false)).toBe(true);
    expect(match('src/build/x.js', false)).toBe(true);
    expect(match('build.js', false)).toBe(false);
  });

  it('supports negation within the same file', () => {
    const match = createGitignoreMatcher([{ baseDir: '', content: '*.log\n!keep.log\n' }]);
    expect(match('debug.log', false)).toBe(true);
    expect(match('keep.log', false)).toBe(false);
    expect(match('sub/keep.log', false)).toBe(false);
  });

  it('lets deeper files override shallower ones', () => {
    const match = createGitignoreMatcher([
      { baseDir: '', content: '*.log\n' },
      { baseDir: 'sub', content: '!keep.log\n' },
    ]);
    expect(match('a.log', false)).toBe(true);
    expect(match('sub/debug.log', false)).toBe(true);
    expect(match('sub/keep.log', false)).toBe(false);
    // 子目录规则不越界：根的 keep.log 仍被忽略。
    expect(match('keep.log', false)).toBe(true);
  });

  it('cannot re-include files below an excluded parent directory', () => {
    const match = createGitignoreMatcher([
      { baseDir: '', content: 'build/\n' },
      { baseDir: 'build', content: '!out.txt\n' },
    ]);
    expect(match('build/out.txt', false)).toBe(true);
  });

  it('anchors leading-slash patterns to the gitignore location', () => {
    const match = createGitignoreMatcher([{ baseDir: '', content: '/root-only.log\n' }]);
    expect(match('root-only.log', false)).toBe(true);
    expect(match('sub/root-only.log', false)).toBe(false);
  });

  it('matches `**` across separators', () => {
    const match = createGitignoreMatcher([{ baseDir: '', content: '**/gen/**.js\n' }]);
    expect(match('gen/a.js', false)).toBe(true);
    expect(match('x/gen/deep/a.js', false)).toBe(true);
    expect(match('x/a.js', false)).toBe(false);
  });

  it('keeps anchored `*` within one level', () => {
    const match = createGitignoreMatcher([{ baseDir: '', content: 'doc/*.txt\n' }]);
    expect(match('doc/a.txt', false)).toBe(true);
    expect(match('doc/sub/a.txt', false)).toBe(false);
  });
});
