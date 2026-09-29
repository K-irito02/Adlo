import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n';
import type { StoragePreflight } from '@shared/ipc/storage';
import type {
  StorageResetExecuteDeps,
  StorageResetPlanResult,
} from '@shared/settings-reset/storageReset';
import { useAppStore } from '@stores/slicedStore';
import { ResetAllDialog } from './ResetAllDialog';
import type { ResetAllOutcome } from './resetAllSettings';

afterEach(cleanup);

// 插值键用真模板：裸 key 回退测不到 {files}/{size}/{group} 的实际替换（同 SettingsPanel.test 约定）。
const TEMPLATES: Record<string, string> = {
  storageMigrateDialogSummary:
    'Core data paths: {files} file(s) (~{size}) will be moved to the new location',
  settingsResetAllProgress: 'Resetting: {group}',
  settingsResetAllConfirmMessage: 'All settings will be restored.',
  settingsResetAllScopePreferences: 'Preferences',
};

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? (TEMPLATES[key] ?? key) : ''),
}) as unknown as CopyDict;

const OK_PREFLIGHT: StoragePreflight = {
  ok: true,
  errors: [],
  warnings: [],
  totalFiles: 7,
  totalBytes: 700,
  freeBytes: 0,
};

const CORE_PLAN: StorageResetPlanResult = {
  status: 'ready',
  plan: {
    blocks: { coreNeeded: true, tree: 'hidden', budget: false, download: 'hidden' },
    preflight: OK_PREFLIGHT,
    migrateAtOpen: false,
  },
};

const NON_CORE_PLAN: StorageResetPlanResult = {
  status: 'ready',
  plan: {
    blocks: { coreNeeded: false, tree: 'hidden', budget: false, download: 'hidden' },
    preflight: null,
    migrateAtOpen: false,
  },
};

const UNAVAILABLE_PLAN: StorageResetPlanResult = { status: 'unavailable' };
const ALL_DEFAULT_PLAN: StorageResetPlanResult = { status: 'allDefault' };

function makeDeps(overrides: Partial<StorageResetExecuteDeps> = {}): StorageResetExecuteDeps {
  return {
    setPaths: async () => ({ ok: true, restartRequired: false, preflight: OK_PREFLIGHT }),
    resetBudget: async () => true,
    resetTreeCache: async () => true,
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
  planResult?: StorageResetPlanResult | null;
  deps?: StorageResetExecuteDeps;
  onClose?: () => void;
  onCommitted?: (outcome: ResetAllOutcome) => void;
}) {
  const onClose = options.onClose ?? vi.fn();
  const onCommitted = options.onCommitted ?? vi.fn();
  render(
    <TCopyProvider t={mockT} locale="en-US">
      <ResetAllDialog
        open
        planResult={options.planResult ?? CORE_PLAN}
        onClose={onClose}
        deps={options.deps ?? makeDeps()}
        onCommitted={onCommitted}
      />
    </TCopyProvider>,
  );
  return { onClose, onCommitted };
}

describe('ResetAllDialog', () => {
  it('开框即渲染确认键（计划由父组件预计算，不再有框内“计算中”）', () => {
    installStoreActions();
    renderDialog({});
    // 核心需迁移：双迁移时机键立即可见，无需等待。
    expect(screen.getByRole('button', { name: 'storageMigrateLater' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'storageGroupResetConfirm' })).toBeNull();
    // 不再渲染分组清单与存储计算行。
    expect(screen.queryByText('settingsResetAllStorageCompute')).toBeNull();
    expect(screen.queryByText('settingsResetAllScopePreferences')).toBeNull();
    // 恢复框绝不渲染搜索空态文案（该文案只属于搜索无结果）。
    expect(screen.queryByText('settingsNoResults')).toBeNull();
  });

  it('不再列出分组清单，仅保留通用确认文案 + 决策项', () => {
    installStoreActions();
    renderDialog({});
    expect(screen.getByText('All settings will be restored.')).not.toBeNull();
    expect(screen.queryByText('settingsResetAllScopeIntro')).toBeNull();
    expect(screen.queryByText('settingsResetAllScopeBrowser')).toBeNull();
    expect(screen.queryByText('settingsResetAllScopeDsh')).toBeNull();
    expect(screen.queryByText('settingsResetAllScopeStorage')).toBeNull();
  });

  it('核心需迁移：展示预检文件数、双迁移时机键，保留源默认不勾', async () => {
    installStoreActions();
    renderDialog({});
    // 断言完整插值片段（totalFiles=7 与 formatBytes(700) 均含 "7"，仅匹 /7/ 会命中非目标文本）。
    expect(
      await screen.findByText(/Core data paths: 7 file\(s\) \(~700\.0 B\) will be moved/),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'storageMigrateLater' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'storageMigrateNow' })).not.toBeNull();
    const retain = screen.getByRole('checkbox') as HTMLInputElement;
    expect(retain.checked).toBe(false);
  });

  it('预检含 error：两键禁用且展示本地化错误列表', async () => {
    installStoreActions();
    const blockedPlan: StorageResetPlanResult = {
      status: 'ready',
      plan: {
        blocks: { coreNeeded: true, tree: 'hidden', budget: false, download: 'hidden' },
        preflight: {
          ok: false,
          errors: [{ category: null, message: 'source and target are identical' }],
          warnings: [],
          totalFiles: 0,
          totalBytes: 0,
          freeBytes: 0,
        },
        migrateAtOpen: false,
      },
    };
    renderDialog({ planResult: blockedPlan });
    const later = (await screen.findByRole('button', {
      name: 'storageMigrateLater',
    })) as HTMLButtonElement;
    const now = screen.getByRole('button', { name: 'storageMigrateNow' }) as HTMLButtonElement;
    expect(later.disabled).toBe(true);
    expect(now.disabled).toBe(true);
    expect(screen.getByText('storagePreflightIdentical')).not.toBeNull();
  });

  it('存储不可用：无分组行，单确认键仍执行其余三组', async () => {
    installStoreActions();
    const onCommitted = vi.fn();
    const { onClose } = renderDialog({
      planResult: UNAVAILABLE_PLAN,
      onCommitted,
    });
    expect(screen.getByText('All settings will be restored.')).not.toBeNull();
    expect(screen.queryByText('settingsResetAllStorageUnavailable')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    const outcome = onCommitted.mock.calls[0][0] as ResetAllOutcome;
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh']);
    expect(outcome.failedAt).toBeUndefined();
    expect(outcome.skipped).toEqual(['storage']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('四块全默认：无分组行，单确认键仍执行其余三组', async () => {
    installStoreActions();
    const onCommitted = vi.fn();
    const { onClose } = renderDialog({
      planResult: ALL_DEFAULT_PLAN,
      onCommitted,
    });
    expect(screen.getByText('All settings will be restored.')).not.toBeNull();
    expect(screen.queryByText('settingsResetAllStorageSkipped')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    const outcome = onCommitted.mock.calls[0][0] as ResetAllOutcome;
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh']);
    expect(outcome.skipped).toEqual(['storage']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('非核心计划：单确认键，无复选框与迁移摘要', () => {
    installStoreActions();
    renderDialog({ planResult: NON_CORE_PLAN });
    expect(screen.getByRole('button', { name: 'storageGroupResetConfirm' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'storageMigrateLater' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('执行中锁定关闭/取消/遮罩/Esc，并展示当前组进度（进度区恒占位）', async () => {
    installStoreActions(() => new Promise<boolean>(() => {}));
    const { onClose } = renderDialog({ planResult: UNAVAILABLE_PLAN });
    // 进度区开框即存在（恒占位，闲时为空白），执行后填入组名。
    expect(document.querySelector('.adl-confirm-dialog__progress')).not.toBeNull();
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

  it('打开即把焦点移入对话框主确认键', async () => {
    installStoreActions();
    renderDialog({});
    const now = (await screen.findByRole('button', {
      name: 'storageMigrateNow',
    })) as HTMLButtonElement;
    expect(now.disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(now));
  });

  it('预检报错禁用主确认键：焦点回落到取消键', async () => {
    installStoreActions();
    const blockedPlan: StorageResetPlanResult = {
      status: 'ready',
      plan: {
        blocks: { coreNeeded: true, tree: 'hidden', budget: false, download: 'hidden' },
        preflight: {
          ok: false,
          errors: [{ category: null, message: 'source and target are identical' }],
          warnings: [],
          totalFiles: 0,
          totalBytes: 0,
          freeBytes: 0,
        },
        migrateAtOpen: false,
      },
    };
    renderDialog({ planResult: blockedPlan });
    const now = (await screen.findByRole('button', {
      name: 'storageMigrateNow',
    })) as HTMLButtonElement;
    await waitFor(() => expect(now.disabled).toBe(true));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'cancel' })),
    );
  });
});
