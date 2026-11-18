import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcErrorCode } from '../../../../shared/ipc/shared';
import type { StoreState } from '../../StoreState';
import type { AppUpdateCheckResult, UpdateBridge } from '../../../../shared/ipc/update';
import type { NotificationSlice } from '../notificationSlice';
import { createNotificationSlice } from '../notificationSlice';
import { createAppUpdateSlice, DEFAULT_APP_UPDATE_PERSISTED } from '../appUpdateSlice';
import type { AppUpdateSlice } from '../appUpdateSlice';

type TestState = AppUpdateSlice & NotificationSlice;

/**
 * 最小 store 环境：切片只依赖 `set`/`get` 两个注入口，这里按同样的签名实现，
 * 不做类型擦除断言（store 层有 ratchet 守卫禁止新增）。
 */
function createHarness() {
  let state!: StoreState;
  const get = (): StoreState => state;
  const set = (partial: Partial<TestState> | ((current: StoreState) => Partial<TestState>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    // 原地合并：切片方法拿到的 `get()` 引用必须与测试持有的对象是同一个。
    Object.assign(state, patch);
  };
  const seed = (initial: TestState) => {
    state = initial as StoreState;
  };
  return { get, set, seed };
}

function result(overrides: Partial<AppUpdateCheckResult> = {}): AppUpdateCheckResult {
  return {
    currentVersion: '0.1.0',
    available: true,
    version: '0.2.0',
    notes: '修复若干问题',
    publishedAt: '2026-11-18T00:00:00Z',
    source: 'https://gitee.com/example/latest.json',
    error: null,
    ...overrides,
  };
}

function installBridge(overrides: Partial<UpdateBridge> = {}): {
  check: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  install: ReturnType<typeof vi.fn>;
} {
  const check = vi.fn(async () => ({ ok: true as const, data: result() }));
  const download = vi.fn(async () => ({ ok: true as const, data: undefined }));
  const install = vi.fn(async () => ({ ok: true as const, data: undefined }));
  const bridge: UpdateBridge = {
    supported: true,
    check,
    download,
    install,
    onProgress: () => () => undefined,
    onInstalling: () => () => undefined,
    ...overrides,
  };
  Object.defineProperty(window, 'digitalLife', {
    value: { update: bridge },
    configurable: true,
    writable: true,
  });
  return { check, download, install };
}

function setup(): TestState {
  const harness = createHarness();
  harness.seed({
    ...createAppUpdateSlice(harness.set, harness.get),
    ...createNotificationSlice(harness.set, harness.get),
  });
  return harness.get();
}

const updateNotifications = (state: TestState) =>
  state.notifications.filter((notification) => notification.type === 'update');

describe('appUpdateSlice', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'digitalLife', { value: undefined, configurable: true });
  });

  it('首次检查发现新版本：写入状态并生成一条更新通知', async () => {
    installBridge();
    const state = setup();

    await state.checkAppUpdate();

    expect(state.appUpdateStatus).toBe('available');
    expect(state.appUpdateVersion).toBe('0.2.0');
    expect(state.appUpdateNotes).toBe('修复若干问题');
    const cards = updateNotifications(state);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toBe('v0.2.0');
    expect(cards[0]?.type).toBe('update');
  });

  it('同版本同一天重复检查不会重复弹通知', async () => {
    installBridge();
    const state = setup();

    await state.checkAppUpdate();
    await state.checkAppUpdate();

    expect(updateNotifications(state)).toHaveLength(1);
  });

  it('已跳过的版本不再生成通知，但仍保留可下载状态', async () => {
    installBridge();
    const state = setup();
    state.appUpdatePersisted = { ...DEFAULT_APP_UPDATE_PERSISTED, skippedVersion: '0.2.0' };

    await state.checkAppUpdate();

    expect(state.appUpdateStatus).toBe('available');
    expect(updateNotifications(state)).toHaveLength(0);
  });

  it('跳过后再手动检查仍会补回卡片（自动检查不会）', async () => {
    installBridge();
    const state = setup();

    await state.checkAppUpdate();
    state.skipAppUpdateVersion();
    expect(updateNotifications(state)).toHaveLength(0);

    await state.checkAppUpdate({ manual: true });

    expect(updateNotifications(state)).toHaveLength(1);
  });

  it('下载失败进入 error，成功后进入 downloaded', async () => {
    const failing = vi.fn(async () => ({
      ok: false as const,
      error: { code: IpcErrorCode.NETWORK_ERROR, message: 'boom' },
    }));
    installBridge({ download: failing });
    const state = setup();
    state.appUpdateVersion = '0.2.0';

    await state.downloadAppUpdate();
    expect(state.appUpdateStatus).toBe('error');
    expect(state.appUpdateError).toBe('boom');

    installBridge();
    await state.downloadAppUpdate();
    expect(state.appUpdateStatus).toBe('downloaded');
    expect(state.appUpdateProgress).toBeNull();
  });

  it('跳过版本会同时清掉该版本卡片', async () => {
    installBridge();
    const state = setup();
    await state.checkAppUpdate();
    expect(updateNotifications(state)).toHaveLength(1);

    state.skipAppUpdateVersion();

    expect(state.appUpdatePersisted.skippedVersion).toBe('0.2.0');
    expect(state.appUpdateStatus).toBe('idle');
    expect(updateNotifications(state)).toHaveLength(0);
  });

  it('手动检查会补回被删掉的卡片（自动检查仍遵守 24h 节流）', async () => {
    installBridge();
    const state = setup();

    await state.checkAppUpdate();
    const [card] = updateNotifications(state);
    expect(card).toBeDefined();
    state.removeNotification(card.id);
    expect(updateNotifications(state)).toHaveLength(0);

    await state.checkAppUpdate({ manual: true });

    expect(updateNotifications(state)).toHaveLength(1);
  });

  it('浏览器模式的桥接不支持时不发请求、不改状态', async () => {
    const bridge = installBridge({ supported: false });
    const state = setup();

    await state.checkAppUpdate();

    expect(bridge.check).not.toHaveBeenCalled();
    expect(state.appUpdateStatus).toBe('idle');
  });

  it('检查完没有新版本时记录「已是最新」，而不是只留一个时间戳', async () => {
    installBridge({
      check: vi.fn(async () => ({
        ok: true as const,
        data: result({ available: false, version: null, notes: null, source: null }),
      })),
    });
    const state = setup();

    await state.checkAppUpdate();

    expect(state.appUpdateStatus).toBe('idle');
    expect(state.appUpdateUpToDate).toBe(true);
    expect(state.appUpdatePersisted.lastCheckedAt).not.toBeNull();
  });
});
