import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { CopyDict } from '@i18n';
import { TCopyProvider } from '@i18n/TCopyContext';
import { STORAGE_CATEGORY_KEYS } from '@shared/ipc/storage';
import { settingsEn } from '../../i18n/en-US/settings';
import { settingsZh } from '../../i18n/zh-CN/settings';
import { CATEGORY_COPY } from './storageCategoryCopy';
import { StorageSettings } from './StorageSettings';

const status = {
  mode: 'unified' as const,
  root: 'C:/Users/u/AppData/Roaming/app',
  locatorPath: 'C:/Users/u/AppData/Roaming/ai-digital-life/storage-locator.json',
  categories: Array.from({ length: 10 }, (_, i) => ({
    key: `c${i}`,
    path: `C:/data/c${i}`,
    movable: true,
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

/** 插值断言专用：加载失败文案带 `{error}` 占位，其余 key 回退为 key 本身。 */
const interpT = new Proxy({} as Record<string, string>, {
  get: (_, key) =>
    key === 'storageStatusLoadFailed' ? 'LOAD FAILED: {error}' : typeof key === 'string' ? key : '',
}) as unknown as CopyDict;

describe('StorageSettings', () => {
  it('renders all 10 category rows with a description hint trigger', async () => {
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
      },
    };
    renderSettings();
    const infos = await screen.findAllByTestId('storage-category-info');
    expect(infos).toHaveLength(STORAGE_CATEGORY_KEYS.length);
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
