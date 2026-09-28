import { describe, it, expect, vi } from 'vitest';
import { computeStorageResetPlan, executeStorageResetPlan } from './storageReset';
import type { StorageResetDeps, StorageResetPlan, StorageResetPredicates } from './storageReset';
import type { StorageStatus } from '@shared/ipc/storage';

const AT_DEFAULT_STATUS = {
  mode: 'unified',
  root: '/data',
  defaultRoot: '/data',
  pending: null,
  categories: [],
} as never;

function deps(overrides: Partial<StorageResetDeps> = {}): StorageResetDeps {
  return {
    bridge: {
      preflight: vi.fn(async () => ({
        ok: true as const,
        data: { ok: true, totalFiles: 3, totalBytes: 300, errors: [], warnings: [], freeBytes: 0 },
      })),
    },
    refreshStatus: vi.fn(async () => AT_DEFAULT_STATUS),
    setPaths: vi.fn(async () => ({
      ok: true as const,
      restartRequired: false,
      preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [], freeBytes: 0 },
    })),
    resetBudget: vi.fn(async () => true),
    resetTreeCache: vi.fn(async () => true),
    previewDownload: () => ({
      settings: { mode: 'auto', default_path: '', auto_migrate_on_path_change: false } as never,
      loaded: true,
    }),
    readTreeStats: () => null,
    readBudgetBytes: () => undefined,
    downloadPath: {
      changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    },
    ...overrides,
  };
}

// 一组简单 stub 谓词：树/下载块恒 'hidden'、预算恒默认；核心按 unified + root===defaultRoot 判定。
// 注：`isTreeCacheAtDefault` 与 `treeBlockOf: 'hidden'` 保持一致（同为「树已默认」），
// 与 R2a 后短路判定改用该谓词的口径对齐。
function predicates(): StorageResetPredicates {
  return {
    isCorePathsAtDefault: vi.fn(
      (status: StorageStatus | null) =>
        status !== null && status.mode === 'unified' && status.root === status.defaultRoot,
    ),
    isTreeCacheAtDefault: vi.fn(() => true),
    isBudgetAtDefault: vi.fn(() => true),
    treeBlockOf: vi.fn(() => 'hidden' as const),
    downloadBlockOf: vi.fn(() => 'hidden' as const),
  };
}

describe('computeStorageResetPlan', () => {
  it('四块全默认时返回 allDefault（无事可做，调用方按跳过处理）', async () => {
    expect(await computeStorageResetPlan(deps(), predicates())).toEqual({ status: 'allDefault' });
  });

  it('核心非默认时做 preflight 并带出 coreNeeded', async () => {
    const d = deps({
      refreshStatus: vi.fn(
        async () =>
          ({
            mode: 'perCategory',
            root: '/x',
            defaultRoot: '/data',
            pending: null,
            categories: [],
          }) as never,
      ),
    });
    const result = await computeStorageResetPlan(d, predicates());
    expect(result.status).toBe('ready');
    const plan = result.status === 'ready' ? result.plan : null;
    expect(plan?.blocks.coreNeeded).toBe(true);
    expect(d.bridge?.preflight).toHaveBeenCalledTimes(1);
    expect(plan?.preflight?.ok).toBe(true);
  });

  it('桥缺失时返回 unavailable（无法判定，调用方按跳过处理）', async () => {
    expect(await computeStorageResetPlan(deps({ bridge: undefined }), predicates())).toEqual({
      status: 'unavailable',
    });
  });

  it('状态不可读或预检 IPC 调用失败时返回 unavailable', async () => {
    expect(
      await computeStorageResetPlan(deps({ refreshStatus: vi.fn(async () => null) }), predicates()),
    ).toEqual({ status: 'unavailable' });
    const failingIpc = deps({
      bridge: {
        preflight: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'Internal' as const, message: 'boom' },
        })),
      },
      refreshStatus: vi.fn(
        async () =>
          ({
            mode: 'perCategory',
            root: '/x',
            defaultRoot: '/data',
            pending: null,
            categories: [],
          }) as never,
      ),
    });
    expect(await computeStorageResetPlan(failingIpc, predicates())).toEqual({
      status: 'unavailable',
    });
  });

  it('核心预检 IPC 成功但 data.ok=false → 仍返回 ready 计划并携带该 preflight（Task 10 依赖）', async () => {
    const failingPreflight = {
      ok: false,
      totalFiles: 0,
      totalBytes: 0,
      errors: [{ category: null, message: 'target unwritable' }],
      warnings: [],
      freeBytes: 0,
    };
    const d = deps({
      bridge: { preflight: vi.fn(async () => ({ ok: true as const, data: failingPreflight })) },
      refreshStatus: vi.fn(
        async () =>
          ({
            mode: 'perCategory',
            root: '/x',
            defaultRoot: '/data',
            pending: null,
            categories: [],
          }) as never,
      ),
    });
    const result = await computeStorageResetPlan(d, predicates());
    expect(result.status).toBe('ready');
    const plan = result.status === 'ready' ? result.plan : null;
    expect(plan?.blocks.coreNeeded).toBe(true);
    expect(plan?.preflight?.ok).toBe(false);
  });

  it('「四块全默认」短路由 isTreeCacheAtDefault 决定（R2a：死契约被真正消费）', async () => {
    const p = predicates();
    // tree 谓词为 false（未默认），但 treeBlockOf 谎报 'hidden'：短路必须以谓词为准。
    p.isTreeCacheAtDefault = vi.fn(() => false);
    p.treeBlockOf = vi.fn(() => 'hidden' as const);
    expect((await computeStorageResetPlan(deps(), p)).status).toBe('ready');
  });
});

describe('executeStorageResetPlan', () => {
  const planWithCore = (): StorageResetPlan => ({
    blocks: { coreNeeded: true, tree: 'hidden', budget: false, download: 'hidden' },
    preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } as never,
    migrateAtOpen: false,
  });

  it('核心先行，setPaths 带上 retainSource 与 applyNow', async () => {
    const d = deps();
    const out = await executeStorageResetPlan(d, planWithCore(), {
      applyNow: true,
      retainSource: true,
    });
    expect(out.result.ok).toBe(true);
    expect(d.setPaths).toHaveBeenCalledWith(expect.objectContaining({ retainSource: true }), true);
  });

  it('核心失败即返回，不再执行后续块', async () => {
    const d = deps({
      setPaths: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'Internal' as const, message: 'nope' },
      })),
    });
    const out = await executeStorageResetPlan(d, planWithCore(), {
      applyNow: false,
      retainSource: false,
    });
    expect(out.result).toEqual({
      ok: false,
      failedStep: 'corePaths',
      error: { code: 'Internal', message: 'nope' },
    });
    expect(d.resetBudget).not.toHaveBeenCalled();
  });

  it('预算失败时 failedStep=budget', async () => {
    const d = deps({ resetBudget: vi.fn(async () => false) });
    const plan: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'hidden', budget: true, download: 'hidden' },
      preflight: null,
      migrateAtOpen: false,
    };
    const out = await executeStorageResetPlan(d, plan, { applyNow: false, retainSource: false });
    expect(out.result).toEqual({ ok: false, failedStep: 'budget' });
  });

  it('restartRequired 透传给调用方', async () => {
    const d = deps({
      setPaths: vi.fn(async () => ({
        ok: true as const,
        restartRequired: true,
        preflight: {
          ok: true,
          totalFiles: 0,
          totalBytes: 0,
          errors: [],
          warnings: [],
          freeBytes: 0,
        },
      })),
    });
    const out = await executeStorageResetPlan(d, planWithCore(), {
      applyNow: true,
      retainSource: false,
    });
    expect(out.restartRequired).toBe(true);
  });

  it('核心预检未通过（IPC 成功但 preflight.ok=false）→ failedStep=corePathsPreflight 并短路后续块', async () => {
    const d = deps({
      setPaths: vi.fn(async () => ({
        ok: true as const,
        restartRequired: false,
        preflight: {
          ok: false,
          totalFiles: 0,
          totalBytes: 0,
          errors: [],
          warnings: [],
          freeBytes: 0,
        },
      })),
    });
    const plan: StorageResetPlan = {
      blocks: { coreNeeded: true, tree: 'hidden', budget: true, download: 'hidden' },
      preflight: { ok: true, totalFiles: 0, totalBytes: 0, errors: [], warnings: [] } as never,
      migrateAtOpen: false,
    };
    const out = await executeStorageResetPlan(d, plan, { applyNow: false, retainSource: false });
    expect(out.result).toEqual({ ok: false, failedStep: 'corePathsPreflight' });
    expect(d.resetBudget).not.toHaveBeenCalled();
  });

  it('预算失败不短路：树缓存与下载仍全部尝试（组级聚合语义）', async () => {
    const d = deps({
      resetBudget: vi.fn(async () => false),
      resetTreeCache: vi.fn(async () => false),
    });
    const plan: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'ttl', budget: true, download: 'off' },
      preflight: null,
      migrateAtOpen: true,
    };
    const out = await executeStorageResetPlan(d, plan, { applyNow: false, retainSource: false });
    expect(out.result).toEqual({ ok: false, failedStep: 'budget' });
    expect(d.resetTreeCache).toHaveBeenCalledTimes(1);
    expect(d.downloadPath.changeDownloadPath).toHaveBeenCalledWith('', true);
  });

  it('树缓存失败时 failedStep=treeCache，且下载块仍被执行', async () => {
    const d = deps({ resetTreeCache: vi.fn(async () => false) });
    const plan: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'full', budget: false, download: 'off' },
      preflight: null,
      migrateAtOpen: false,
    };
    const out = await executeStorageResetPlan(d, plan, { applyNow: false, retainSource: false });
    expect(out.result).toEqual({ ok: false, failedStep: 'treeCache' });
    expect(d.downloadPath.changeDownloadPath).toHaveBeenCalledTimes(1);
  });

  it('下载失败时保留自身 failedStep 与 error（供调用方复现下载族失败文案）', async () => {
    const d = deps({
      downloadPath: {
        changeDownloadPath: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'Internal' as const, message: 'migrate failed' },
        })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      },
    });
    const plan: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'hidden', budget: false, download: 'on' },
      preflight: null,
      migrateAtOpen: true,
    };
    const out = await executeStorageResetPlan(d, plan, { applyNow: false, retainSource: false });
    expect(out.result).toEqual({
      ok: false,
      failedStep: 'downloadPath',
      error: { code: 'Internal', message: 'migrate failed' },
    });
  });

  it('downloadFailure 独立暴露：预算先失败时仍带出下载块自身结果（R9）', async () => {
    const d = deps({
      resetBudget: vi.fn(async () => false),
      downloadPath: {
        changeDownloadPath: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'Internal' as const, message: 'migrate failed' },
        })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      },
    });
    const plan: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'hidden', budget: true, download: 'on' },
      preflight: null,
      migrateAtOpen: true,
    };
    const out = await executeStorageResetPlan(d, plan, { applyNow: false, retainSource: false });
    // 聚合裁决仍取首个失败块（预算），下载块结果另经 downloadFailure 暴露。
    expect(out.result).toEqual({ ok: false, failedStep: 'budget' });
    expect(out.downloadFailure).toEqual({
      ok: false,
      failedStep: 'downloadPath',
      error: { code: 'Internal', message: 'migrate failed' },
    });
  });

  it('downloadFailure 在下载成功或未执行时为 undefined（R9）', async () => {
    const ranAndSucceeded: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'hidden', budget: false, download: 'on' },
      preflight: null,
      migrateAtOpen: false,
    };
    const success = await executeStorageResetPlan(deps(), ranAndSucceeded, {
      applyNow: false,
      retainSource: false,
    });
    expect(success.result.ok).toBe(true);
    expect(success.downloadFailure).toBeUndefined();

    const skipped: StorageResetPlan = {
      blocks: { coreNeeded: false, tree: 'hidden', budget: false, download: 'hidden' },
      preflight: null,
      migrateAtOpen: false,
    };
    const skippedOut = await executeStorageResetPlan(deps(), skipped, {
      applyNow: false,
      retainSource: false,
    });
    expect(skippedOut.result.ok).toBe(true);
    expect(skippedOut.downloadFailure).toBeUndefined();
  });
});
