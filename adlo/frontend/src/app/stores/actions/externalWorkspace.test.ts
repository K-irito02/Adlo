import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_WORKSPACE_PREFIX,
  createExternalWorkspaceEntry,
  externalWorkspaceId,
  isExternalWorkspaceId,
  splitAbsolutePath,
} from './externalWorkspace';

describe('externalWorkspace', () => {
  it('derives a stable id per folder and never includes a colon', () => {
    const first = externalWorkspaceId('E:/Downloads');
    const second = externalWorkspaceId('E:\\Downloads');
    expect(first).toBe(second);
    expect(first.startsWith(EXTERNAL_WORKSPACE_PREFIX)).toBe(true);
    // 保存链按首个 `:` 拆分工作区键，id 带冒号会把相对路径截断。
    expect(first).not.toContain(':');
    // 双哈希：两段各 8 位十六进制。
    expect(first).toMatch(/^external-[0-9a-f]{8}-[0-9a-f]{8}$/);
    expect(externalWorkspaceId('E:/Pictures')).not.toBe(first);
  });

  it('splits an absolute path into the parent folder and file name', () => {
    expect(splitAbsolutePath('E:\\Downloads\\photo.png')).toEqual({
      rootPath: 'E:/Downloads',
      fileName: 'photo.png',
    });
    expect(splitAbsolutePath('E:/a/b/c.mp3')).toEqual({ rootPath: 'E:/a/b', fileName: 'c.mp3' });
    // `C:` 是驱动器相对路径，根必须补斜杠。
    expect(splitAbsolutePath('C:/a.md')).toEqual({ rootPath: 'C:/', fileName: 'a.md' });
    expect(splitAbsolutePath('D:\\notes.md')).toEqual({ rootPath: 'D:/', fileName: 'notes.md' });
    expect(splitAbsolutePath('\\\\server\\share\\a.md')).toEqual({
      rootPath: '//server/share',
      fileName: 'a.md',
    });
  });

  it('rejects paths without a usable parent', () => {
    expect(splitAbsolutePath('a.md')).toBeNull();
    expect(splitAbsolutePath('docs/a.md')).toBeNull();
    expect(splitAbsolutePath('')).toBeNull();
    // 末尾斜杠会被忽略，按普通路径拆分。
    expect(splitAbsolutePath('C:/Downloads/')).toEqual({
      rootPath: 'C:/',
      fileName: 'Downloads',
    });
  });

  it('builds a hidden entry that can never reach the sidebar', () => {
    const entry = createExternalWorkspaceEntry('E:/Downloads');
    expect(entry.removedFromSidebar).toBe(true);
    expect(entry.available).toBe(true);
    expect(entry.path).toBe('E:/Downloads');
    expect(entry.rootPath).toBe('E:/Downloads');
    expect(entry.name).toBe('Downloads');
    expect(isExternalWorkspaceId(entry.id)).toBe(true);
    expect(isExternalWorkspaceId('workspace_3bf908e6')).toBe(false);
    // 盘符根保留尾斜杠，避免后端按驱动器相对路径解析。
    expect(createExternalWorkspaceEntry('C:/').rootPath).toBe('C:/');
  });
});
