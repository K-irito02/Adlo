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
// 注意 mockT 为 Proxy：未知 key 回退为 key 名本身，因此 queryByText(<deadKey>)===null
// 即“未渲染该 key”；若改此回退，下方死键守卫需同步重写。
// ConfirmMessage 用生产真值（真值锁定另见 keys.test.ts，此处验 key 有渲染）。
const TEMPLATES: Record<string, string> = {
  storageMigrateDialogSummary:
    'Core data paths: {files} file(s) (~{size}) will be moved to the new location',
  settingsResetAllProgress: 'Resetting: {group}',
  settingsResetAllConfirmMessage:
    'All settings will be restored to defaults. This cannot be undone.',
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
    blocks: { coreNeeded: true, tree: 'hidden', download: 'hidden' },
    preflight: OK_PREFLIGHT,
    migrateAtOpen: false,
  },
};

const NON_CORE_PLAN: StorageResetPlanResult = {
  status: 'ready',
  plan: {
    blocks: { coreNeeded: false, tree: 'hidden', download: 'hidden' },
    preflight: null,
    migrateAtOpen: false,
  },
};

const UNAVAILABLE_PLAN: StorageResetPlanResult = { status: 'unavailable' };
const ALL_DEFAULT_PLAN: StorageResetPlanResult = { status: 'allDefault' };

/** 预检阻塞计划（ok=false）：两迁移键禁用、retain 同步禁用、焦点回落取消键。三处用例共用。 */
const BLOCKED_PLAN: StorageResetPlanResult = {
  status: 'ready',
  plan: {
    blocks: { coreNeeded: true, tree: 'hidden', download: 'hidden' },
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

function makeDeps(overrides: Partial<StorageResetExecuteDeps> = {}): StorageResetExecuteDeps {
  return {
    setPaths: async () => ({ ok: true, restartRequired: false, preflight: OK_PREFLIGHT }),
    resetTreeCache: async () => true,
    downloadPath: {
      changeDownloadPath: async () => ({ ok: true, data: { migrated: 0, missing: 0 } }),
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
  setBrowserShareProfile: unknown;
}

/** 以成功桩替换偏好/浏览器/DSH 的 store action（编排器经 store 实时取用）。 */
function installStoreActions(updatePreferences?: unknown): StoreSnapshot {
  const snapshot: StoreSnapshot = {
    updatePreferences: useAppStore.getState().updatePreferences,
    updateDownloadSettings: useAppStore.getState().updateDownloadSettings,
    changeDownloadPath: useAppStore.getState().changeDownloadPath,
    saveSourceConfig: useAppStore.getState().saveSourceConfig,
    setBrowserShareProfile: useAppStore.getState().setBrowserShareProfile,
  };
  useAppStore.setState({
    updatePreferences: (updatePreferences ?? vi.fn(async () => true)) as never,
    updateDownloadSettings: vi.fn(async () => ({ ok: true, data: undefined })) as never,
    changeDownloadPath: vi.fn(async () => ({ ok: true, data: undefined })) as never,
    saveSourceConfig: vi.fn(async () => true) as never,
    setBrowserShareProfile: vi.fn() as never,
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
  opener?: HTMLElement | null;
}) {
  const onClose = options.onClose ?? vi.fn();
  const onCommitted = options.onCommitted ?? vi.fn();
  const opener = options.opener;
  const { rerender } = render(
    <TCopyProvider t={mockT} locale="en-US">
      <ResetAllDialog
        open
        planResult={options.planResult === undefined ? CORE_PLAN : options.planResult}
        onClose={onClose}
        deps={options.deps ?? makeDeps()}
        onCommitted={onCommitted}
        opener={opener}
      />
    </TCopyProvider>,
  );
  return {
    onClose,
    onCommitted,
    close: () =>
      rerender(
        <TCopyProvider t={mockT} locale="en-US">
          <ResetAllDialog
            open={false}
            planResult={options.planResult === undefined ? CORE_PLAN : options.planResult}
            onClose={onClose}
            deps={options.deps ?? makeDeps()}
            onCommitted={onCommitted}
            opener={opener}
          />
        </TCopyProvider>,
      ),
  };
}

describe('ResetAllDialog', () => {
  it('开框即渲染确认键（计划由父组件预计算，不再有框内“计算中”）', () => {
    installStoreActions();
    renderDialog({});
    // 核心需迁移：双迁移时机键立即可见，无需等待。
    expect(screen.getByRole('button', { name: 'storageMigrateLater' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'storageGroupResetConfirm' })).toBeNull();
    // 不再渲染分组清单与存储计算行（ScopePreferences 在 mock 中映射为 'Preferences'，
    // 故断言渲染文本而非键名，否则恒过无分辨力）。
    expect(screen.queryByText('settingsResetAllStorageCompute')).toBeNull();
    // 'Preferences' 为 ScopePreferences 的 mock 简化值（生产真值见 keys.test.ts 双语锁）：
    // 进度文案与下方的“无分组清单”断言均依赖此映射，改 mock 需同步两处。
    expect(screen.queryByText('Preferences')).toBeNull();
    // 恢复框绝不渲染搜索空态文案（该文案只属于搜索无结果）。
    expect(screen.queryByText('settingsNoResults')).toBeNull();
  });

  it('不再列出分组清单，仅保留通用确认文案 + 决策项', () => {
    installStoreActions();
    renderDialog({});
    expect(
      screen.getByText('All settings will be restored to defaults. This cannot be undone.'),
    ).not.toBeNull();
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
    renderDialog({ planResult: BLOCKED_PLAN });
    const later = (await screen.findByRole('button', {
      name: 'storageMigrateLater',
    })) as HTMLButtonElement;
    const now = screen.getByRole('button', { name: 'storageMigrateNow' }) as HTMLButtonElement;
    expect(later.disabled).toBe(true);
    expect(now.disabled).toBe(true);
    expect(screen.getByText('storagePreflightIdentical')).not.toBeNull();
  });

  it('预检阻塞时保留源复选框同步禁用（不可提交即不可勾选）', async () => {
    installStoreActions();
    renderDialog({ planResult: BLOCKED_PLAN });
    await screen.findByRole('button', { name: 'storageMigrateNow' });
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('汇总回调抛错时仍解锁并关框（无 unhandled 锁定）', async () => {
    installStoreActions();
    const onCommitted = vi.fn().mockRejectedValue(new Error('toast down'));
    const { onClose } = renderDialog({ planResult: UNAVAILABLE_PLAN, onCommitted });
    fireEvent.click(await screen.findByRole('button', { name: 'storageGroupResetConfirm' }));
    // 恢复已完成：汇总抛错不阻塞 onClose（真实关框由父组件 setState 完成，此处以回调为准）；
    // vitest 若有 unhandled rejection 会单列 Unhandled Errors（本文件须零条）；
    // finally 保解锁：即使 onClose mock 不卸载，取消键也须恢复可用（包 waitFor，
    // 使重渲染 flush 有重试，避免极端调度下读到旧 disabled 值）。
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'cancel' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  it('存储不可用：无分组行，单确认键仍执行其余四组', async () => {
    installStoreActions();
    useAppStore.setState({ browserShareProfile: false });
    const onCommitted = vi.fn();
    const { onClose } = renderDialog({
      planResult: UNAVAILABLE_PLAN,
      onCommitted,
    });
    expect(
      screen.getByText('All settings will be restored to defaults. This cannot be undone.'),
    ).not.toBeNull();
    expect(screen.queryByText('settingsResetAllStorageUnavailable')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    const outcome = onCommitted.mock.calls[0][0] as ResetAllOutcome;
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh', 'network']);
    expect(outcome.failedAt).toBeUndefined();
    expect(outcome.skipped).toEqual(['storage']);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().setBrowserShareProfile).toHaveBeenCalledWith(true);
  });

  it('四块全默认：无分组行，单确认键仍执行其余四组', async () => {
    installStoreActions();
    const onCommitted = vi.fn();
    const { onClose } = renderDialog({
      planResult: ALL_DEFAULT_PLAN,
      onCommitted,
    });
    expect(
      screen.getByText('All settings will be restored to defaults. This cannot be undone.'),
    ).not.toBeNull();
    expect(screen.queryByText('settingsResetAllStorageSkipped')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'storageGroupResetConfirm' }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    const outcome = onCommitted.mock.calls[0][0] as ResetAllOutcome;
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh', 'network']);
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

  it('传入 opener 时关框焦点归还 opener（覆盖 activeElement 回落分支）', async () => {
    installStoreActions();
    const opener = document.createElement('button');
    opener.textContent = 'opener-btn';
    document.body.appendChild(opener);
    try {
      const { close } = renderDialog({ opener });
      // 开框焦点已入框（主确认键可用，直落其上）。
      await screen.findByRole('button', { name: 'storageMigrateNow' });
      close();
      await waitFor(() => expect(document.activeElement).toBe(opener));
    } finally {
      opener.remove();
    }
  });

  it('防御分支 planResult=null：单确认键可用且焦点直落其上', async () => {
    installStoreActions();
    renderDialog({ planResult: null });
    const confirm = (await screen.findByRole('button', {
      name: 'storageGroupResetConfirm',
    })) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(confirm));
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
    renderDialog({ planResult: BLOCKED_PLAN });
    const now = (await screen.findByRole('button', {
      name: 'storageMigrateNow',
    })) as HTMLButtonElement;
    await waitFor(() => expect(now.disabled).toBe(true));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'cancel' })),
    );
  });
});
