import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { STORAGE_CATEGORY_KEYS } from '@shared/ipc/storage';
import { formatBytes } from '@root/design-system/html';
import { settingsEn } from '../../i18n/en-US/settings';
import { settingsZh } from '../../i18n/zh-CN/settings';
import { CATEGORY_COPY } from './storageCategoryCopy';
import { StorageSettings } from './StorageSettings';

const status = {
  mode: 'unified' as const,
  root: 'C:/Users/u/AppData/Roaming/app',
  locatorPath: 'C:/Users/u/AppData/Roaming/ai-digital-life/storage-locator.json',
  categories: STORAGE_CATEGORY_KEYS.map((key) => ({
    key,
    path: `C:/data/${key}`,
    movable: key !== 'downloads_default',
    exists: true,
    bytes: 1024,
    files: 2,
    foreignFiles: [],
  })),
  pending: null,
  lastReport: null,
};

beforeEach(() => {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    storage: {
      getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
      scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      preflight: vi.fn(),
      setPaths: vi.fn(),
      cancelPending: vi.fn(),
      restartApp: vi.fn(),
      getTreeCacheStats: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          workspaceCount: 0,
          totalBytes: 0,
          oldestCapturedAt: null,
          newestCapturedAt: null,
          enabled: true,
          ttlMinutes: 15,
        },
      }),
      setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// 与其它设置组测试同构：用 Proxy 桩文案（返回 key 本身）避免依赖完整 i18n 词典。
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function renderSettings(t: CopyDict = mockT) {
  return render(
    <TCopyProvider t={t} locale="en-US">
      <StorageSettings />
    </TCopyProvider>,
  );
}

/** 块上方「恢复 核心数据路径 全部默认」图标按钮。 */
function headerResetButton(): HTMLElement | null {
  return document.querySelector('[data-testid="storage-reset-defaults"]');
}

/** 插值断言专用：加载失败文案带 `{error}` 占位，其余 key 回退为 key 本身。 */
const interpT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    key === 'storageStatusLoadFailed' ? 'LOAD FAILED: {error}' : typeof key === 'string' ? key : '',
}) as unknown as CopyDict;

describe('StorageSettings', () => {
  it('lays out loaded content as editorial settings cards', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const cards = document.querySelectorAll('.adl-settings-card');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    // 合并后的「核心数据路径」块：顶部为 恢复默认图标 + 主标题（在块上方的 header 容器内）。
    const header = document.querySelector('.adl-storage-settings > .adl-settings-storage__header');
    expect(header).not.toBeNull();
    expect(header?.querySelector('.adl-settings-header')).not.toBeNull();
    expect(header?.querySelector('[data-testid="storage-reset-defaults"]')).not.toBeNull();
  });

  it('renders the restore-default trigger with the reset group label', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const refresh = headerResetButton();
    expect(refresh).not.toBeNull();
    // mockT 桩文案回退为 key 本身：aria-label 由 settingsResetGroupToDefault + 标题拼接。
    expect(refresh?.getAttribute('aria-label')).toBe('settingsResetGroupToDefault');
  });

  it('restoring defaults resets drafts and opens the migration flow with a default patch', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    fireEvent.click(headerResetButton() as HTMLElement);
    await waitFor(() => {
      expect(preflight).toHaveBeenCalledTimes(1);
    });
    // 恢复默认补丁 = 统一根 + 空根（后端视为默认根）+ 无逐类覆盖 + 不保留源。
    expect(preflight).toHaveBeenCalledWith({
      mode: 'unified',
      root: '',
      categories: {},
      retainSource: false,
    });
    // 进入迁移对话框（冲突/确认即此对话框，不额外二次确认）。
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows the sticky dirty bar when paths change and applies on click', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 未修改：不显示脏提交条。
    expect(screen.queryByTestId('storage-dirtybar')).toBeNull();

    // 修改数据根目录 → 出现粘性提交条。
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/new-root' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();

    // 点提交条里的「应用」→ 走迁移流程（preflight）。
    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', {
        name: 'storageApply',
      }),
    );
    await waitFor(() => {
      expect(preflight).toHaveBeenCalledTimes(1);
    });
  });

  it('reverts unsaved path changes via the revert button and clears the dirty bar', async () => {
    const preflight = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        errors: [],
        warnings: [],
        totalFiles: 0,
        totalBytes: 0,
        freeBytes: 0,
      },
    });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight,
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    const rootInput = screen.getByRole('textbox', { name: 'storageManualInput' });
    fireEvent.change(rootInput, { target: { value: 'D:/changed' } });
    expect(screen.getByTestId('storage-dirtybar')).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('storage-dirtybar')).getByRole('button', {
        name: 'storageRevert',
      }),
    );
    // 撤回后恢复持久化状态：脏条与底部提交区都不再显示，且不触发 preflight。
    await waitFor(() => {
      expect(screen.queryByTestId('storage-dirtybar')).toBeNull();
    });
    expect(screen.queryByTestId('storage-bottom-cta')).toBeNull();
    expect(preflight).not.toHaveBeenCalled();
    expect((rootInput as HTMLInputElement).value).toBe(status.root);
  });

  it('moves hint triggers before their titles for mode, root and locator rows', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 所有 info 触发器（mode/root/category×10/locator）数量 >= 13。
    const infos = document.querySelectorAll('.adl-icon-button--info');
    expect(infos.length).toBeGreaterThanOrEqual(13);
  });

  it('renders all visible category rows (default download target hidden)', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 每类都必须有说明（spec §6.4 硬性要求）
    expect(screen.getAllByTestId('storage-category-info')).toHaveLength(10);
  });

  it('opens the hint card with the category description when clicking the info trigger', async () => {
    const realStatus = {
      ...status,
      categories: STORAGE_CATEGORY_KEYS.map((key) => ({
        key,
        path: `C:/data/${key}`,
        movable: key !== 'downloads_default',
        exists: true,
        bytes: 1024,
        files: 2,
        foreignFiles: [],
      })),
    };
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: realStatus }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    const infos = await screen.findAllByTestId('storage-category-info');
    const first = infos[0];
    await act(async () => {
      fireEvent.click(first);
    });
    // mockT 桩文案返回 key 本身：第一个分类（database）的 Desc key 应出现在 hint 卡片中
    // （卡片内容 span 含 desc + related 两段文本，用正则匹配 desc 片段）。
    expect(screen.getByText(/storageCategoryDatabaseDesc/)).toBeTruthy();
  });

  it('lists the six immovable entries', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-immutable-item')).toHaveLength(6);
    });
  });

  it('renders immovable entry names, not only descriptions', async () => {
    renderSettings();
    const items = await screen.findAllByTestId('storage-immutable-item');
    const names = [
      'storageImmutableKeyringName',
      'storageImmutableMachineIdName',
      'storageImmutableLocalStorageName',
      'storageImmutableIndexedDbName',
      'storageImmutableWebview2Name',
      'storageImmutableWorkspaceCacheName',
    ];
    expect(items).toHaveLength(names.length);
    for (const [index, item] of items.entries()) {
      expect(item.textContent).toContain(names[index]);
    }
  });

  it('shows an actionable error when storage status cannot be loaded', async () => {
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: false, error: { message: 'boom' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    // 失败时不渲染空的分类行，避免"标题下无内容"的误导。
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    // 加载态必须清除（不卡 loading）。
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
  });

  it('shows a load-failed (not timeout) error when the status request rejects', async () => {
    // F3：真实拒绝（channel closed）走加载失败路径，仅计时器走超时文案。
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockRejectedValue(new Error('channel closed')),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryByText('storageStatusTimeout')).toBeNull();
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
  });

  it('shows timeout UI when getStatus never settles (fake timers)', async () => {
    vi.useFakeTimers();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockImplementation(() => new Promise(() => {})),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    expect(screen.getByText('storageStatusLoading')).toBeTruthy();
    // fake-timers 下 `waitFor` 不推进时钟：用 `act` 包裹推进，避免轮询挂死。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText('storageStatusTimeout')).toBeTruthy();
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
  });

  it('does not hang when the backend returns a malformed failure without error object', async () => {
    // 回归：真实故障是后端返回裸成功值（有 categories、无 ok，如旧后端未包 IpcResult），
    // 前端 !result.ok 为真后曾在 result.error.message 抛错并卡死 loading。
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({
          mode: 'unified',
          root: 'C:/data',
          locatorPath: 'C:/locator.json',
          categories: [],
          pending: null,
          lastReport: null,
        }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    // 畸形体必须打 warn 供排查（T3）。
    expect(warnSpy).toHaveBeenCalled();
  });

  it('surfaces load error without hanging on malformed ok:true without categories (F1)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: { mode: 'unified', root: 'x' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('every real category has non-empty Desc + Related copy (Task-5b)', async () => {
    const realStatus = {
      ...status,
      categories: STORAGE_CATEGORY_KEYS.map((key) => ({
        key,
        path: `C:/data/${key}`,
        movable: key !== 'downloads_default',
        exists: true,
        bytes: 1024,
        files: 2,
        foreignFiles: [],
      })),
    };
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: realStatus }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    const infos = await screen.findAllByTestId('storage-category-info');
    // downloads_default 不占展示行（并入「浏览器默认下载路径」块），渲染 info 数为 总类数-1。
    expect(infos).toHaveLength(STORAGE_CATEGORY_KEYS.length - 1);
    // 渲染出的每个 ⓘ 触发器都必须带出 Desc 文案：缺 copy 时回退为裸 key。
    for (const [index, info] of infos.entries()) {
      const key = STORAGE_CATEGORY_KEYS[index] as string;
      const label = info.getAttribute('aria-label') ?? '';
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(key);
    }
    // 映射层全覆盖：每类在中英词典中都有非空 Desc + Related。
    for (const key of STORAGE_CATEGORY_KEYS) {
      const copy = CATEGORY_COPY[key];
      expect(copy, `missing CATEGORY_COPY for ${key}`).toBeDefined();
      for (const dict of [settingsEn, settingsZh] as const) {
        const desc = (dict as Record<string, unknown>)[copy.desc];
        const related = (dict as Record<string, unknown>)[copy.related];
        expect(typeof desc === 'string' && desc.length > 0, `${key} Desc empty`).toBe(true);
        expect(typeof related === 'string' && related.length > 0, `${key} Related empty`).toBe(
          true,
        );
      }
    }
  });

  it('shows the original message without warn on a well-formed failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: false, error: { message: 'disk-gone' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    // 规范失败体透传原 message，且不打 warn（warn 仅用于畸形体）。
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('interpolates the backend message into the load-failed text', async () => {
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: false, error: { message: 'disk-gone' } }),
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings(interpT);
    await waitFor(() => {
      expect(screen.getByText('LOAD FAILED: disk-gone')).toBeTruthy();
    });
  });

  it('retry stays on error for malformed response, then recovers on well-formed response (T1/F4)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { message: 'first' } })
      .mockResolvedValueOnce({ mode: 'unified', root: 'C:/x', locatorPath: '', categories: [] })
      .mockResolvedValueOnce({ ok: true, data: status });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus,
        scanForeign: vi.fn(),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            workspaceCount: 0,
            totalBytes: 0,
            oldestCapturedAt: null,
            newestCapturedAt: null,
            enabled: true,
            ttlMinutes: 15,
          },
        }),
        setTreeCacheOptions: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
        clearTreeCache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      },
    };
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);

    // 第一次点击重试：后端返回畸形体（无 ok）→ 仍显示错误、不卡 loading。
    fireEvent.click(screen.getByRole('button', { name: 'storageRetry' }));
    await waitFor(() => {
      expect(getStatus).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText('storageStatusLoadFailed')).toBeTruthy();
    });
    expect(screen.queryAllByTestId('storage-category-row')).toHaveLength(0);
    expect(screen.queryByText('storageStatusLoading')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    // 第二次点击重试：良构成功 → 错误清除、10 行渲染（F4）。
    fireEvent.click(screen.getByRole('button', { name: 'storageRetry' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    expect(screen.queryByText('storageStatusLoadFailed')).toBeNull();
  });
});

describe('StorageSettings tree cache section (T9)', () => {
  const treeStatsData = {
    workspaceCount: 2,
    totalBytes: 1024,
    oldestCapturedAt: 1,
    newestCapturedAt: 2,
    enabled: true,
    ttlMinutes: 15,
  };

  // 真实 settingsEn 词典兜底 key 名：treeCache 文案走插值断言，其余行沿用 key 名。
  const treeT = new Proxy(settingsEn as unknown as Record<string, string>, {
    get: (target, key) => (typeof key === 'string' && key in target ? target[key] : key),
  }) as unknown as CopyDict;

  function renderTreeSection(
    overrides: {
      statsData?: typeof treeStatsData;
      getTreeCacheStats?: ReturnType<typeof vi.fn>;
      setTreeCacheOptions?: ReturnType<typeof vi.fn>;
      clearTreeCache?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const getTreeCacheStats =
      overrides.getTreeCacheStats ??
      vi.fn().mockResolvedValue({ ok: true, data: overrides.statsData ?? treeStatsData });
    const setTreeCacheOptions =
      overrides.setTreeCacheOptions ?? vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const clearTreeCache =
      overrides.clearTreeCache ?? vi.fn().mockResolvedValue({ ok: true, data: undefined });
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      storage: {
        getStatus: vi.fn().mockResolvedValue({ ok: true, data: status }),
        scanForeign: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        preflight: vi.fn(),
        setPaths: vi.fn(),
        cancelPending: vi.fn(),
        restartApp: vi.fn(),
        getTreeCacheStats,
        setTreeCacheOptions,
        clearTreeCache,
      },
    };
    render(
      <TCopyProvider t={treeT} locale="en-US">
        <StorageSettings />
      </TCopyProvider>,
    );
    return { getTreeCacheStats, setTreeCacheOptions, clearTreeCache };
  }

  it('shows tree-cache stats and clears on confirm', async () => {
    const { getTreeCacheStats, clearTreeCache } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    expect(screen.getByText(settingsEn.treeCacheWorkspaces.replace('{count}', '2'))).toBeTruthy();
    expect(
      screen.getByText(settingsEn.treeCacheSize.replace('{size}', formatBytes(1024))),
    ).toBeTruthy();

    // 二次确认：点清除先弹对话框，确认后才调用一次。
    fireEvent.click(screen.getByTestId('tree-cache-clear'));
    await screen.findByText(settingsEn.treeCacheClearConfirm);
    expect(clearTreeCache).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: settingsEn.treeCacheClear }));
    await waitFor(() => {
      expect(clearTreeCache).toHaveBeenCalledTimes(1);
    });
    // 清除后重拉 stats 刷新展示。
    await waitFor(() => {
      expect(getTreeCacheStats).toHaveBeenCalledTimes(2);
    });
  });

  it('toggling the master switch calls setTreeCacheOptions', async () => {
    const { setTreeCacheOptions } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    const toggle = screen.getByRole('checkbox', { name: settingsEn.treeCacheEnabled });
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: false, ttlMinutes: 15 });
  });

  it('changing the TTL calls setTreeCacheOptions with the new value', async () => {
    const { setTreeCacheOptions } = renderTreeSection();
    await screen.findByTestId('tree-cache-section');
    fireEvent.click(screen.getByRole('button', { name: settingsEn.treeCacheTtl }));
    fireEvent.click(screen.getByRole('option', { name: '60 minutes' }));
    await waitFor(() => {
      expect(setTreeCacheOptions).toHaveBeenCalledTimes(1);
    });
    expect(setTreeCacheOptions).toHaveBeenCalledWith({ enabled: true, ttlMinutes: 60 });
  });
});
