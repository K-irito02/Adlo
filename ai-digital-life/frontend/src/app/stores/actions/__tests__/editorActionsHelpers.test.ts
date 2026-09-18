import { describe, expect, it, vi } from 'vitest';
import { openFileGeneric } from '../editorActionsHelpers';
import { getNextFileRequestSeq } from '../../cacheHelpers';
import type { StoreState } from '../../StoreState';

interface Snap {
  selectedFilePath?: string;
  fileContent?: string;
  fileOpenError?: { path: string; code: string; message: string } | null;
  openTabs: { path: string }[];
}

function setup(initial: Partial<Snap>) {
  let current = {
    selectedFilePath: undefined,
    fileContent: undefined,
    fileOpenError: undefined,
    openTabs: [],
    dirtyEditorPaths: [],
    errorToasts: [],
    externalFileChange: undefined,
    ...initial,
  } as unknown as StoreState;
  const snapshots: Snap[] = [];
  const set = (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
    const patch = typeof partial === 'function' ? partial(current) : partial;
    current = { ...current, ...patch } as StoreState;
    snapshots.push({
      selectedFilePath: current.selectedFilePath,
      fileContent: current.fileContent,
      fileOpenError: (current as unknown as Snap).fileOpenError,
      openTabs: (current.openTabs ?? []).map((t: { path: string }) => ({ path: t.path })),
    });
  };
  const get = () => current;
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    workspace: { setEditorDirtyPaths: vi.fn() },
  };
  return { set, get, snapshots };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('openFileGeneric hold-until-ready (事项 46 调整项)', () => {
  it('does not switch the visible file until content resolves on cache miss', async () => {
    const { set, get, snapshots } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const gate = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();

    const pending = openFileGeneric(set as never, get as never, 'new.md', getNextFileRequestSeq(), {
      cacheKey: `hold-test-miss-${Date.now()}-1`,
      workspaceId: 'ws-1',
      readFile: () => gate.promise as never,
    });
    // 同步前缀执行后：主区必须仍是旧文件（不得出现中间态）
    expect(get().selectedFilePath).toBe('old.md');
    expect(get().fileContent).toBe('old content');

    gate.resolve({ ok: true, data: { content: 'new content', lastModifiedAt: 2 } });
    await pending;
    expect(get().selectedFilePath).toBe('new.md');
    expect(get().fileContent).toBe('new content');
    // 全程不得出现"路径已切新、内容仍旧"的中间快照
    for (const snap of snapshots) {
      if (snap.selectedFilePath === 'new.md') {
        expect(snap.fileContent).toBe('new content');
      }
    }
  });

  it('shows a friendly error in the main area instead of stale content on failure', async () => {
    const reportError = vi.fn();
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    (get() as unknown as { reportError: unknown }).reportError = reportError;

    await openFileGeneric(set as never, get as never, 'gone.md', getNextFileRequestSeq(), {
      cacheKey: `hold-test-fail-${Date.now()}-2`,
      workspaceId: 'ws-1',
      readFile: () =>
        Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'gone' } }) as never,
    });

    // 主区切到目标路径但展示错误，不回退显示旧文件内容
    expect(get().selectedFilePath).toBe('gone.md');
    expect(get().fileContent).not.toBe('old content');
    const fileOpenError = (get() as unknown as Snap).fileOpenError;
    expect(fileOpenError?.path).toBe('gone.md');
    expect(typeof fileOpenError?.code).toBe('string');
  });

  it('still applies cache hits atomically in one commit', async () => {
    const { set, get, snapshots } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const { setCachedFileDocument } = await import('../../cacheHelpers');
    const key = `hold-test-hit-${Date.now()}-3`;
    setCachedFileDocument(key, { content: 'cached content', lastModifiedAt: 5 });

    await openFileGeneric(set as never, get as never, 'cached.md', getNextFileRequestSeq(), {
      cacheKey: key,
      workspaceId: 'ws-1',
      readFile: () => {
        throw new Error('must not read on cache hit');
      },
    });

    expect(get().selectedFilePath).toBe('cached.md');
    expect(get().fileContent).toBe('cached content');
    expect(snapshots).toHaveLength(1);
  });
});
