import { describe, expect, it } from 'vitest';
import { sameWorkspacePath, workspacePathKey } from './workspacePathMatch';

describe('workspacePathKey', () => {
  it('collapses sepArators, trailing slashes and drive-letter case', () => {
    expect(workspacePathKey('E:\\Repo\\')).toBe(workspacePathKey('e:/repo'));
    expect(workspacePathKey('\\\\?\\E:\\Repo')).toBe('e:/repo');
    expect(workspacePathKey('  E:/repo//  ')).toBe('e:/repo');
    // 盘符根（无子路径）同样按 Windows 语义折叠大小写。
    expect(workspacePathKey('E:/')).toBe(workspacePathKey('e:'));
  });

  it('keeps non-drive path case on case-sensitive filesystems', () => {
    expect(workspacePathKey('/w/Repo')).not.toBe(workspacePathKey('/w/repo'));
  });

  it('returns an empty key for blank input', () => {
    expect(workspacePathKey(undefined)).toBe('');
    expect(workspacePathKey('   ')).toBe('');
  });
});

describe('sameWorkspacePath', () => {
  it('matches the same directory written differently', () => {
    expect(sameWorkspacePath('E:\\Repo\\', 'e:/repo')).toBe(true);
    expect(sameWorkspacePath('\\\\?\\E:\\Repo', 'E:/Repo')).toBe(true);
  });

  it('never matches empty values', () => {
    expect(sameWorkspacePath(undefined, undefined)).toBe(false);
    expect(sameWorkspacePath('', '')).toBe(false);
    expect(sameWorkspacePath('/a', undefined)).toBe(false);
  });

  it('does not merge distinct roots', () => {
    expect(sameWorkspacePath('/a/one', '/a/two')).toBe(false);
    expect(sameWorkspacePath('/w/Repo', '/w/repo')).toBe(false);
  });
});
