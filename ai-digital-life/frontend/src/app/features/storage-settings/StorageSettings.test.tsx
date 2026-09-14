import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// 与其它设置组测试同构：用 Proxy 桩文案（返回 key 本身）避免依赖完整 i18n 词典。
const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function renderSettings() {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <StorageSettings />
    </TCopyProvider>,
  );
}

describe('StorageSettings', () => {
  it('renders all 10 category rows with a description tooltip trigger', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-category-row')).toHaveLength(10);
    });
    // 每类都必须有说明（spec §6.4 硬性要求）
    expect(screen.getAllByTestId('storage-category-info')).toHaveLength(10);
  });

  it('lists the six immovable entries', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getAllByTestId('storage-immutable-item')).toHaveLength(6);
    });
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
});
