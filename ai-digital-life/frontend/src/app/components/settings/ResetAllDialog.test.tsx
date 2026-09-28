import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n';
import type { StoragePreflight, StorageStatus, TreeCacheStats } from '@shared/ipc/storage';
import type { StorageResetDeps, StorageResetPredicates } from '@shared/settings-reset/storageReset';
import { useAppStore } from '@stores/slicedStore';
import { ResetAllDialog } from './ResetAllDialog';
import type { ResetAllOutcome } from './resetAllSettings';

afterEach(cleanup);

// 插值键用真模板：裸 key 回退测不到 {files}/{size}/{group} 的实际替换（同 SettingsPanel.test 约定）。
const TEMPLATES: Record<string, string> = {
  storageMigrateDialogSummary:
    'Core data paths: {files} file(s) (~{size}) will be moved to the new location',
  settingsResetAllProgress: 'Resetting: {group}',
  settingsResetAllScopePreferences: 'Preferences',
};

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? (TEMPLATES[key] ?? key) : ''),
}) as unknown as CopyDict;

const STATUS: StorageStatus = {
  mode: 'per_category',
  root: '/x',
  defaultRoot: '/data',
  categories: [],
  locatorPath: '/data/storage-locator.json',
  pending: null,
  lastReport: null,
};

const OK_PREFLIGHT: StoragePreflight = {
  ok: true,
  errors: [],
  warnings: [],
  totalFiles: 7,
  totalBytes: 700,
  freeBytes: 0,
};

const PREDICATES: StorageResetPredicates = {
  isCorePathsAtDefault: () => false,
  isTreeCacheAtDefault: () => true,
  isBudgetAtDefault: () => true,
  treeBlockOf: () => 'hidden',
  downloadBlockOf: () => 'hidden',
};

const TREE_STATS: TreeCacheStats = {
  workspaceCount: 0,
  totalBytes: 0,
  oldestCapturedAt: null,
  newestCapturedAt: null,
  enabled: true,
  ttlMinutes: 15,
};

function makeDeps(overrides: Partial<StorageResetDeps> = {}): StorageResetDeps {
  return {
    bridge: { preflight: async () => ({ ok: true, data: OK_PREFLIGHT }) },
    refreshStatus: async () => STATUS,
    setPaths: async () => ({ ok: true, restartRequired: false, preflight: OK_PREFLIGHT }),
    resetBudget: async () => true,
    resetTreeCache: async () => true,
    previewDownload: () => ({
      settings: { mode: 'auto', default_path: '', auto_migrate_on_path_change: false },
      loaded: true,
    }),
    readTreeStats: () => TREE_STATS,
    readBudgetBytes: () => undefined,
    downloadPath: {
      changeDownloadPath: async () => ({ ok: true, data: undefined }),
      updateDownloadSettings: async () => ({ ok: true, data: undefined }),
    },
    ...overrides,
  };
}

interface StoreSnapshot {
  updatePreferences: unknown;
  updateDownloadSettings: unknown;
  changeDownloadPath: unknown;
  saveSourceConfig: unknown;
}

/** 以成功桩替换偏好/浏览器/DSH 的 store action（编排器经 store 实时取用）。 */
function installStoreActions(updatePreferences?: unknown): StoreSnapshot {
  const snapshot: StoreSnapshot = {
    updatePreferences: useAppStore.getState().updatePreferences,
    updateDownloadSettings: useAppStore.getState().updateDownloadSettings,
    changeDownloadPath: useAppStore.getState().changeDownloadPath,
    saveSourceConfig: useAppStore.getState().saveSourceConfig,
  };
  useAppStore.setState({
    updatePreferences: (updatePreferences ?? vi.fn(async () => true)) as never,
    updateDownloadSettings: vi.fn(async () => ({ ok: true, data: undefined })) as never,
    changeDownloadPath: vi.fn(async () => ({ ok: true, data: undefined })) as never,
    saveSourceConfig: vi.fn(async () => true) as never,
  });
  installedSnapshot = snapshot;
  return snapshot;
}

function restoreStoreActions(snapshot: StoreSnapshot): void {
  useAppStore.setState(snapshot as never);
}

// 每个用例结束都还原 store 桩，杜绝全局 action 泄漏到后续文件。
let installedSnapshot: StoreSnapshot | null = null;
afterEach(() => {
  if (installedSnapshot !== null) {
    restoreStoreActions(installedSnapshot);
    installedSnapshot = null;
  }
});

function renderDialog(options: {
  deps?: StorageResetDeps;
  onClose?: () => void;
  onCommitted?: (outcome: ResetAllOutcome) => void;
}) {
  const onClose = options.onClose ?? vi.fn();
  const onCommitted = options.onCommitted ?? vi.fn();
  render(
    <TCopyProvider t={mockT} locale="en-US">
      <ResetAllDialog
        open
        onClose={onClose}
        deps={options.deps ?? makeDeps()}
        storagePredicates={PREDICATES}
        onCommitted={onCommitted}
      />
    </TCopyProvider>,
  );
  return { onClose, onCommitted };
}

describe('ResetAllDialog', () => {
  it('计算中展示存储「计算中」行且不给出确认键，且不使用搜索空态文案', async () => {
    installStoreActions();
    renderDialog({ deps: makeDeps({ bridge: { preflight: () => new Promise(() => {}) } }) });
    expect(await screen.findByText('settingsResetAllStorageCompute')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'storageMigrateLater' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'storageGroupResetConfirm' })).toBeNull();
    // 恢复框绝不渲染搜索空态文案（该文案只属于搜索无结果）。
    expect(screen.queryByText('settingsNoResults')).toBeNull();
  });

  it('核心需迁移：展示预检文件数、双迁移时机键，保留源默认不勾', async () => {
    installStoreActions();
    renderDialog({});
    expect(await screen.findByText(/7/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'storageMigrateLater' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'storageMigrateNow' })).not.toBeNull();
    const retain = screen.getByRole('checkbox') as HTMLInputElement;
    expect(retain.checked).toBe(false);
  });

  it('预检含 error：两键禁用且展示本地化错误列表', async () => {
    installStoreActions();
    renderDialog({
      deps: makeDeps({
        bridge: {
          preflight: async () => ({
            ok: true,
            data: {
              ok: false,
              errors: [{ category: null, message: 'source and target are identical' }],
              warnings: [],
              totalFiles: 0,
              totalBytes: 0,
              freeBytes: 0,
            },
          }),
        },
      }),
    });
    const later = (await screen.findByRole('button', {
      name: 'storageMigrateLater',
    })) as HTMLButtonElement;
    const now = screen.getByRole('button', { name: 'storageMigrateNow' }) as HTMLButtonElement;
    expect(later.disabled).toBe(true);
    expect(now.disabled).toBe(true);
    expect(screen.getByText('storagePreflightIdentical')).not.toBeNull();
  });

  it('计划为 null：存储行标注不可用，单确认键仍执行其余三组', async () => {
    installStoreActions();
    const onCommitted = vi.fn();
    const { onClose } = renderDialog({
      deps: makeDeps({ bridge: undefined }),
      onCommitted,
    });
    expect(await screen.findByText('settingsResetAllStorageUnavailable')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    const outcome = onCommitted.mock.calls[0][0] as ResetAllOutcome;
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh']);
    expect(outcome.failedAt).toBeUndefined();
    expect(outcome.skipped).toEqual(['storage']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('执行中锁定关闭/取消/遮罩/Esc，并展示当前组进度', async () => {
    installStoreActions(() => new Promise<boolean>(() => {}));
    const { onClose } = renderDialog({ deps: makeDeps({ bridge: undefined }) });
    fireEvent.click(await screen.findByRole('button', { name: 'storageGroupResetConfirm' }));

    // 进度文案带当前组名（preferences 首组，真模板插值）。
    expect(await screen.findByText('Resetting: Preferences')).not.toBeNull();

    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'cancel' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'storageGroupResetConfirm' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
