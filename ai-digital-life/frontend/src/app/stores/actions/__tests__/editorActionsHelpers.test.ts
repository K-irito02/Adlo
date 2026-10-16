import { describe, expect, it, vi } from 'vitest';
import {
  openFileGeneric,
  openMediaFileGeneric,
  openChangePreviewGeneric,
} from '../editorActionsHelpers';
import { getNextFileRequestSeq, getNextChangePreviewRequestSeq } from '../../cacheHelpers';
import { pendingChangePreviewPath, getCachedChangePreview } from '../../cacheHelpers';
import type { StoreState } from '../../StoreState';
import type { WorkspaceChangePreview } from '@ai-digital-life/kernel';

interface Snap {
  selectedFilePath?: string;
  fileContent?: string;
  fileOpenError?: { path: string; code: string; message: string } | null;
  openTabs: { path: string }[];
  outline?: unknown;
  selectedChangePreviewPath?: string;
  changePreview?: WorkspaceChangePreview;
  changePreviewLoading?: boolean;
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

describe('openFileGeneric generation guard (事项 13 收敛)', () => {
  it('迟到的旧读被新意图作废：不写缓存不进主区', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const cacheKey = `gen-test-${Date.now()}`;
    const slow = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();
    const fast = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();
    // 同一 seq：排除全局文件序号守卫，只测同路径代际守卫（如保存 bump 代际的场景）。
    const seq = getNextFileRequestSeq();

    const first = openFileGeneric(set as never, get as never, 'same.md', seq, {
      cacheKey,
      workspaceId: 'ws-1',
      readFile: () => slow.promise as never,
    });
    const second = openFileGeneric(set as never, get as never, 'same.md', seq, {
      cacheKey,
      workspaceId: 'ws-1',
      readFile: () => fast.promise as never,
    });
    fast.resolve({ ok: true, data: { content: 'new content', lastModifiedAt: 2 } });
    await second;
    // 旧读后落地：必须被丢弃，主区保持新内容
    slow.resolve({ ok: true, data: { content: 'stale content', lastModifiedAt: 1 } });
    await first;
    expect(get().fileContent).toBe('new content');
    expect(get().selectedFilePath).toBe('same.md');
  });
});

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

describe('cross-type open race', () => {
  it('discards the slower text open when a media open wins the race', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const textGate = deferred<{ ok: true; data: { content: string; lastModifiedAt: number } }>();
    const mediaGate = deferred<{
      ok: true;
      data: { path: string; mime: string; base64: string; size: number; lastModifiedAt: number };
    }>();

    const textPending = openFileGeneric(
      set as never,
      get as never,
      'slow.md',
      getNextFileRequestSeq(),
      {
        cacheKey: `race-text-${Date.now()}`,
        workspaceId: 'ws-1',
        readFile: () => textGate.promise as never,
      },
    );
    const mediaPending = openMediaFileGeneric(
      set as never,
      get as never,
      'fast.mp4',
      getNextFileRequestSeq(),
      {
        workspaceId: 'ws-1',
        readMediaFile: () => mediaGate.promise as never,
      },
    );

    mediaGate.resolve({
      ok: true,
      data: { path: 'fast.mp4', mime: 'video/mp4', base64: 'AA==', size: 1, lastModifiedAt: 1 },
    });
    await mediaPending;
    expect(get().selectedFilePath).toBe('fast.mp4');
    // 媒体落定即熄灭加载态，骨架不残留。
    expect((get() as unknown as { fileMediaLoading: boolean }).fileMediaLoading).toBe(false);
    // 后完成的文本打开是过期响应，必须丢弃，不得覆盖媒体终态。
    textGate.resolve({ ok: true, data: { content: 'stale text', lastModifiedAt: 2 } });
    await textPending;
    expect(get().selectedFilePath).toBe('fast.mp4');
    expect(get().fileContent).not.toBe('stale text');
  });
});

describe('fileMediaLoading flag', () => {
  it('is true while pending and false after success', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    const gate = deferred<{
      ok: true;
      data: { path: string; mime: string; base64: string; size: number; lastModifiedAt: number };
    }>();

    const pending = openMediaFileGeneric(
      set as never,
      get as never,
      'clip.mp4',
      getNextFileRequestSeq(),
      {
        workspaceId: 'ws-1',
        readMediaFile: () => gate.promise as never,
      },
    );
    expect((get() as unknown as { fileMediaLoading: boolean }).fileMediaLoading).toBe(true);

    gate.resolve({
      ok: true,
      data: { path: 'clip.mp4', mime: 'video/mp4', base64: 'AA==', size: 1, lastModifiedAt: 1 },
    });
    await pending;
    expect((get() as unknown as { fileMediaLoading: boolean }).fileMediaLoading).toBe(false);
  });
});

describe('openChangePreviewGeneric failure (事项3：门被旧预览侵占）', () => {
  function preview(path: string, currentContent: string): WorkspaceChangePreview {
    return {
      path,
      changeKind: 'modified',
      status: 'modified',
      baseExists: true,
      currentExists: true,
      baseContent: 'base',
      currentContent,
    };
  }

  it('失败时清掉旧预览（选中切到目标，不残留上一个文件的内容）', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
      selectedChangePreviewPath: 'small.ts',
      changePreview: preview('small.ts', 'small content'),
      changePreviewLoading: false,
    });
    mockReportError(get);

    await openChangePreviewGeneric(
      set as never,
      get as never,
      'big.json',
      getNextChangePreviewRequestSeq(),
      {
        cacheKey: `change-fail-${Date.now()}`,
        workspaceId: 'ws-1',
        getPreview: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'INVALID_INPUT', message: 'file exceeds configured read limit' },
          }) as never,
      },
    );

    // 选中切到目标，但旧预览必须清除（此前保留 small.ts 导致"门出不来、内容仍是旧文件"）
    const state = get() as unknown as Snap;
    expect(state.selectedChangePreviewPath).toBe('big.json');
    expect(state.changePreview).toBeUndefined();
    expect(state.changePreviewLoading).toBe(false);
  });

  it('失败后重试成功可正常展示（清掉的状态不影响后续成功）', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
      selectedChangePreviewPath: 'small.ts',
      changePreview: preview('small.ts', 'small content'),
      changePreviewLoading: false,
    });
    mockReportError(get);
    const key = `change-fail-then-ok-${Date.now()}`;

    await openChangePreviewGeneric(
      set as never,
      get as never,
      'big.json',
      getNextChangePreviewRequestSeq(),
      {
        cacheKey: key,
        workspaceId: 'ws-1',
        getPreview: () =>
          Promise.resolve({
            ok: false,
            error: { code: 'INVALID_INPUT', message: 'too large' },
          }) as never,
      },
    );
    expect((get() as unknown as Snap).changePreview).toBeUndefined();

    await openChangePreviewGeneric(
      set as never,
      get as never,
      'big.json',
      getNextChangePreviewRequestSeq(),
      {
        cacheKey: key,
        workspaceId: 'ws-1',
        getPreview: () =>
          Promise.resolve({ ok: true, data: preview('big.json', 'big content') }) as never,
      },
    );
    const state = get() as unknown as Snap;
    expect(state.changePreview?.path).toBe('big.json');
    expect(state.changePreview?.currentContent).toBe('big content');
    expect(state.changePreviewLoading).toBe(false);
  });

  it('pending 期选中与内容保持旧值（就绪才切换，大切小不再闪门）', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
      selectedChangePreviewPath: 'huge.json',
      changePreview: preview('huge.json', 'huge content'),
      changePreviewLoading: false,
    });
    mockReportError(get);
    let resolvePreview!: (
      v: { ok: true; data: WorkspaceChangePreview } | { ok: false; error: unknown },
    ) => void;
    const gate = new Promise<
      { ok: true; data: WorkspaceChangePreview } | { ok: false; error: unknown }
    >((r) => {
      resolvePreview = r;
    });

    const pending = openChangePreviewGeneric(
      set as never,
      get as never,
      'small.ts',
      getNextChangePreviewRequestSeq(),
      {
        cacheKey: `change-pending-${Date.now()}`,
        workspaceId: 'ws-2',
        getPreview: () => gate as never,
      },
    );
    // 同步前缀执行后：选中仍是旧文件（门 key 不错配），内容仍是旧预览
    const mid = get() as unknown as Snap;
    expect(mid.selectedChangePreviewPath).toBe('huge.json');
    expect(mid.changePreview?.path).toBe('huge.json');
    expect(mid.changePreviewLoading).toBe(true);

    resolvePreview({ ok: true, data: preview('small.ts', 'small content') });
    await pending;
    const after = get() as unknown as Snap;
    expect(after.selectedChangePreviewPath).toBe('small.ts');
    expect(after.changePreview?.path).toBe('small.ts');
    expect(after.changePreviewLoading).toBe(false);
  });

  it('pending 期登记 pendingChangePreviewPath，落定后清除（复审 H2 守卫依据）', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
      selectedChangePreviewPath: 'huge.json',
      changePreview: preview('huge.json', 'huge'),
      changePreviewLoading: false,
    });
    mockReportError(get);
    let resolvePreview!: (v: { ok: true; data: WorkspaceChangePreview }) => void;
    const gate = new Promise<{ ok: true; data: WorkspaceChangePreview }>((r) => {
      resolvePreview = r;
    });

    const pending = openChangePreviewGeneric(
      set as never,
      get as never,
      'big.json',
      getNextChangePreviewRequestSeq(),
      {
        cacheKey: `pending-track-${Date.now()}`,
        workspaceId: 'ws-1',
        getPreview: () => gate as never,
      },
    );
    expect(pendingChangePreviewPath).toBe('big.json');
    resolvePreview({ ok: true, data: preview('big.json', 'big') });
    await pending;
    expect(pendingChangePreviewPath).toBeUndefined();
  });

  it('重型预览不入缓存（复审 M3，与开文件重型不入缓存同例）', async () => {
    const { set, get } = setup({
      selectedFilePath: 'old.md',
      fileContent: 'old content',
      openTabs: [{ path: 'old.md' }],
    });
    mockReportError(get);
    const key = `heavy-nocache-${Date.now()}`;
    const { TEXT_HEAVY_PREVIEW_CHARS } =
      await import('../../../regions/right-panel/heavyPreviewLimits');
    const huge = 'x'.repeat(TEXT_HEAVY_PREVIEW_CHARS + 16);

    await openChangePreviewGeneric(
      set as never,
      get as never,
      'huge.json',
      getNextChangePreviewRequestSeq(),
      {
        cacheKey: key,
        workspaceId: 'ws-1',
        getPreview: () => Promise.resolve({ ok: true, data: preview('huge.json', huge) }) as never,
      },
    );
    expect((get() as unknown as Snap).changePreview?.path).toBe('huge.json');
    expect(getCachedChangePreview(key)).toBeUndefined();
  });
});
