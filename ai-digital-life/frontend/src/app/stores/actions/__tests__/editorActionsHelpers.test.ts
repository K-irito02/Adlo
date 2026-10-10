import { describe, expect, it, vi } from 'vitest';
import { openFileGeneric, openMediaFileGeneric } from '../editorActionsHelpers';
import { getNextFileRequestSeq } from '../../cacheHelpers';
import type { StoreState } from '../../StoreState';

interface Snap {
  selectedFilePath?: string;
  fileContent?: string;
  fileOpenError?: { path: string; code: string; message: string } | null;
  openTabs: { path: string }[];
  outline?: unknown;
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

/** 为 captureError 挂载 reportError mock（Phase 4 审查 O4 去重）。 */
function mockReportError(get: () => StoreState): ReturnType<typeof vi.fn> {
  const reportError = vi.fn();
  (get() as unknown as { reportError: unknown }).reportError = reportError;
  return reportError;
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
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    mockReportError(get);

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

  it('discards a slow stale response when a newer open wins the race (H1)', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const gateA = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();
    const gateB = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();

    const pendingA = openFileGeneric(set as never, get as never, 'a.md', getNextFileRequestSeq(), {
      cacheKey: `race-a-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () => gateA.promise as never,
    });
    const pendingB = openFileGeneric(set as never, get as never, 'b.md', getNextFileRequestSeq(), {
      cacheKey: `race-b-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () => gateB.promise as never,
    });
    gateB.resolve({ ok: true, data: { content: 'B content', lastModifiedAt: 2 } });
    await pendingB;
    expect(get().selectedFilePath).toBe('b.md');
    // A 后 resolve（成功）：过期门控丢弃，不得覆盖 B。
    gateA.resolve({ ok: true, data: { content: 'A content', lastModifiedAt: 3 } });
    await pendingA;
    expect(get().selectedFilePath).toBe('b.md');
    expect(get().fileContent).toBe('B content');
    expect((get() as unknown as Snap).fileOpenError).toBeFalsy();
  });

  it('discards a slow stale failure when a newer open wins the race (H1)', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const reportError = mockReportError(get);
    const gateA = deferred<{ ok: false; error: { code: string; message: string } }>();
    const gateB = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();

    const pendingA = openFileGeneric(set as never, get as never, 'a.md', getNextFileRequestSeq(), {
      cacheKey: `race-fail-a-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () => gateA.promise as never,
    });
    const pendingB = openFileGeneric(set as never, get as never, 'b.md', getNextFileRequestSeq(), {
      cacheKey: `race-fail-b-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () => gateB.promise as never,
    });
    gateB.resolve({ ok: true, data: { content: 'B content', lastModifiedAt: 2 } });
    await pendingB;
    // A 后失败：过期门控丢弃，不得把 selected 切回 A，也不得挂 A 的 error。
    gateA.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'gone' } });
    await pendingA;
    expect(get().selectedFilePath).toBe('b.md');
    expect((get() as unknown as Snap).fileOpenError).toBeFalsy();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('clears the error after failure-then-success on the same path (H2)', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    mockReportError(get);
    const key = `fail-then-ok-${Date.now()}`;
    const failCfg = {
      cacheKey: key,
      workspaceId: 'ws-1',
      readFile: () =>
        Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'gone' } }) as never,
    };
    await openFileGeneric(set as never, get as never, 'gone.md', getNextFileRequestSeq(), failCfg);
    expect((get() as unknown as Snap).fileOpenError?.path).toBe('gone.md');

    await openFileGeneric(set as never, get as never, 'gone.md', getNextFileRequestSeq(), {
      cacheKey: key,
      workspaceId: 'ws-1',
      readFile: () =>
        Promise.resolve({ ok: true, data: { content: 'back again', lastModifiedAt: 9 } }) as never,
    });
    expect(get().fileContent).toBe('back again');
    expect((get() as unknown as Snap).fileOpenError).toBeNull();
  });

  it('submits the same failure state when readFile rejects (M1)', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const reportError = mockReportError(get);

    await openFileGeneric(set as never, get as never, 'boom.md', getNextFileRequestSeq(), {
      cacheKey: `reject-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () => Promise.reject(new Error('boom')) as never,
    });

    expect(get().selectedFilePath).toBe('boom.md');
    expect(get().fileContent).toBeUndefined();
    const fileOpenError = (get() as unknown as Snap).fileOpenError;
    expect(fileOpenError?.code).toBe('UNKNOWN');
    expect(fileOpenError?.message).toContain('boom');
    expect(reportError).toHaveBeenCalled();
  });

  it('keeps the error view during a retry pending instead of blank editor (M2)', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    mockReportError(get);
    const key = `retry-pending-${Date.now()}`;
    await openFileGeneric(set as never, get as never, 'gone.md', getNextFileRequestSeq(), {
      cacheKey: key,
      workspaceId: 'ws-1',
      readFile: () =>
        Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'gone' } }) as never,
    });
    expect((get() as unknown as Snap).fileOpenError?.path).toBe('gone.md');

    // 重试（同路径再次 open）：resolve 前错误仍在，不跌落空编辑器。
    const gate = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();
    const pending = openFileGeneric(
      set as never,
      get as never,
      'gone.md',
      getNextFileRequestSeq(),
      {
        cacheKey: key,
        workspaceId: 'ws-1',
        readFile: () => gate.promise as never,
      },
    );
    expect((get() as unknown as Snap).fileOpenError?.path).toBe('gone.md');
    expect(get().selectedFilePath).toBe('gone.md');

    gate.resolve({ ok: true, data: { content: 'recovered', lastModifiedAt: 4 } });
    await pending;
    expect(get().fileContent).toBe('recovered');
    expect((get() as unknown as Snap).fileOpenError).toBeNull();
  });

  it('keeps derived state on old values while pending, tab added upfront (M5)', async () => {
    const outline = [{ id: 'old-outline' }];
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
      outline: outline as never,
    });
    const gate = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();

    const pending = openFileGeneric(set as never, get as never, 'new.md', getNextFileRequestSeq(), {
      cacheKey: `pending-inv-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () => gate.promise as never,
    });
    // 同步前缀后：tab 已加（点击反馈），其余派生状态保持旧值。
    expect(get().openTabs.map((t: { path: string }) => t.path)).toContain('new.md');
    expect(get().selectedFilePath).toBe('old.md');
    expect(get().fileContent).toBe('old content');
    expect(get().outline).toBe(outline);

    gate.resolve({ ok: true, data: { content: 'new content', lastModifiedAt: 2 } });
    await pending;
    expect(get().selectedFilePath).toBe('new.md');
  });
});

describe('openMediaFileGeneric', () => {
  it('sets fileMedia and clears text content on success', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const media = {
      path: 'clip.mp4',
      mime: 'video/mp4',
      base64: 'AAECAw==',
      size: 4,
      lastModifiedAt: 7,
    };

    const opened = await openMediaFileGeneric(
      set as never,
      get as never,
      'clip.mp4',
      getNextFileRequestSeq(),
      {
        cacheKey: `media-ok-${Date.now()}`,
        workspaceId: 'ws-1',
        readMediaFile: () => Promise.resolve({ ok: true, data: media }) as never,
      },
    );

    expect(opened).toBe(true);
    expect(get().selectedFilePath).toBe('clip.mp4');
    expect(get().fileContent).toBeUndefined();
    expect((get() as unknown as { fileMedia: typeof media }).fileMedia).toEqual(media);
    expect((get() as unknown as Snap).fileOpenError).toBeNull();
  });

  it('submits the shared failure state without stale content on error', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    mockReportError(get);

    const opened = await openMediaFileGeneric(
      set as never,
      get as never,
      'huge.mp4',
      getNextFileRequestSeq(),
      {
        cacheKey: `media-fail-${Date.now()}`,
        workspaceId: 'ws-1',
        readMediaFile: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'INVALID_INPUT', message: 'too large' },
          }) as never,
      },
    );

    expect(opened).toBe(false);
    expect(get().selectedFilePath).toBe('huge.mp4');
    expect(get().fileContent).not.toBe('old content');
    expect((get() as unknown as Snap).fileOpenError?.path).toBe('huge.mp4');
  });
});

describe('openFileGeneric heavy text', () => {
  it('builds an outline for normal text', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });

    await openFileGeneric(set as never, get as never, 'doc.md', getNextFileRequestSeq(), {
      cacheKey: `heavy-normal-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () =>
        Promise.resolve({
          ok: true,
          data: { content: '# Title\n\nbody\n', lastModifiedAt: 1 },
        }) as never,
    });

    expect(get().fileContent).toContain('# Title');
    expect((get() as unknown as { outline: unknown[] }).outline.length).toBeGreaterThan(0);
  });

  it('skips outline parsing for text above the heavy threshold', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const { TEXT_HEAVY_PREVIEW_CHARS } =
      await import('../../../regions/right-panel/heavyPreviewLimits');
    const huge = `# Title\n${'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS + 16)}`;

    await openFileGeneric(set as never, get as never, 'huge.md', getNextFileRequestSeq(), {
      cacheKey: `heavy-skip-${Date.now()}`,
      workspaceId: 'ws-1',
      readFile: () =>
        Promise.resolve({
          ok: true,
          data: { content: huge, lastModifiedAt: 1 },
        }) as never,
    });

    // 内容照常到达（渲染由内容区重型门把关），但大纲为空以避免确认前卡顿。
    expect((get() as unknown as { fileContent: string }).fileContent.length).toBe(huge.length);
    expect((get() as unknown as { outline: unknown[] }).outline).toEqual([]);
  });
});
