import { describe, expect, it } from 'vitest';
import { isGitMetaPath, partitionBatchPaths } from '../gitMetaBatch';

describe('gitMetaBatch', () => {
  it('isGitMetaPath matches .git/ paths and bare .git, case-insensitively, both separators', () => {
    expect(isGitMetaPath('.git/index')).toBe(true);
    expect(isGitMetaPath('.git\\index')).toBe(true);
    expect(isGitMetaPath('.GIT/refs/heads/main')).toBe(true);
    expect(isGitMetaPath('.git')).toBe(true);
    expect(isGitMetaPath('./.git/HEAD')).toBe(true);
    expect(isGitMetaPath('src/.git/index')).toBe(false);
    expect(isGitMetaPath('.gitignore')).toBe(false);
    expect(isGitMetaPath('gitref')).toBe(false);
    expect(isGitMetaPath('normal/file.txt')).toBe(false);
  });

  it('partitionBatchPaths splits git paths from normal paths preserving order', () => {
    expect(partitionBatchPaths(['a.md', '.git/index', 'b.ts'])).toEqual({
      git: ['.git/index'],
      normal: ['a.md', 'b.ts'],
    });
    expect(partitionBatchPaths([])).toEqual({ git: [], normal: [] });
  });
});
