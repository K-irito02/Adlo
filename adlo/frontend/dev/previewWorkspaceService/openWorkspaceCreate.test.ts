import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWorkspaceTarget } from './files';

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adl-preview-open-'));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveWorkspaceTarget', () => {
  it('creates an absolute missing directory only when create is true', () => {
    const base = tempDir();
    const target = path.join(base, 'a', 'b');

    expect(() => resolveWorkspaceTarget(target, false, base)).toThrow(/does not exist/);
    expect(resolveWorkspaceTarget(target, true, base)).toBe(target);
    expect(fs.statSync(target).isDirectory()).toBe(true);
  });

  it('rejects an existing file only when creating', () => {
    const base = tempDir();
    const target = path.join(base, 'file.txt');
    fs.writeFileSync(target, 'x');

    expect(() => resolveWorkspaceTarget(target, true, base)).toThrow(/not a directory/);
    expect(resolveWorkspaceTarget(target, false, base)).toBe(target);
  });

  it('resolves a single name under the default root', () => {
    const base = tempDir();

    expect(resolveWorkspaceTarget('my-project', true, base)).toBe(path.join(base, 'my-project'));
    expect(fs.statSync(path.join(base, 'my-project')).isDirectory()).toBe(true);
  });

  it('rejects parent and nested relative names', () => {
    const base = tempDir();

    expect(() => resolveWorkspaceTarget('..', true, base)).toThrow(/single folder name/);
    expect(() => resolveWorkspaceTarget('a/b', true, base)).toThrow(/single folder name/);
  });
});
