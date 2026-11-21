import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppInfo, RecentWorkspaceEntry } from '@adlo/kernel';
import { useAppStore } from '../slicedStore';
import type { StoreState } from '../StoreState';
import { requestMediaSource, resolveWorkspaceRootForMedia } from '../mediaSourceResolver';

/**
 * 媒体来源的工作区解析回归（P4 R1 补测）：
 * - 显式 workspaceId 找不到时**不回退**当前工作区（避免跨工作区串读）；
 * - `externalFileRoots` 是外部文件根的权威来源；
 * - 根不可解析时 `requestMediaSource` 早退 WORKSPACE_ERROR，不调用桥接。
 */

const WORKSPACE: RecentWorkspaceEntry = {
  id: 'ws-1',
  path: 'C:/ws/one',
  rootPath: 'C:/ws/one',
  name: 'one',
  lastOpenedAt: 1,
  isPinned: false,
  pinnedOrder: 0,
  unpinnedOrder: 0,
  removedFromSidebar: false,
  available: true,
};

function appInfoWith(rootPath?: string): AppInfo {
  return {
    appName: 'Adlo',
    version: '0.1.0',
    config: {} as AppInfo['config'],
    currentWorkspace: rootPath
      ? {
          id: 'current',
          path: rootPath,
          rootPath,
          name: 'current',
          type: 'unknown',
          status: 'ready',
          createdAt: 0,
          updatedAt: 0,
          lastOpenedAt: 0,
        }
      : undefined,
    recentLogs: [],
    runtime: {} as AppInfo['runtime'],
  };
}

function fakeState(
  patch: Partial<Pick<StoreState, 'appInfo' | 'recentWorkspaces' | 'externalFileRoots'>>,
): StoreState {
  return { ...useAppStore.getState(), ...patch };
}

function installBridge(mediaSource: ReturnType<typeof vi.fn>) {
  // `as unknown as` 会被 store cast ratchet 拦截；用 defineProperty 直接挂测试桩。
  Object.defineProperty(window, 'digitalLife', {
    value: { workspace: { mediaSource } },
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'digitalLife');
});

describe('resolveWorkspaceRootForMedia', () => {
  it('无 workspaceId 时取当前工作区根', () => {
    const state = fakeState({ appInfo: appInfoWith('C:/ws/current'), recentWorkspaces: [] });
    expect(resolveWorkspaceRootForMedia(state)).toBe('C:/ws/current');
  });

  it('显式 workspaceId 命中侧栏工作区', () => {
    const state = fakeState({
      appInfo: appInfoWith('C:/ws/current'),
      recentWorkspaces: [WORKSPACE],
    });
    expect(resolveWorkspaceRootForMedia(state, 'ws-1')).toBe('C:/ws/one');
  });

  it('命中 externalFileRoots（外部文件根）', () => {
    const state = fakeState({
      appInfo: appInfoWith('C:/ws/current'),
      recentWorkspaces: [],
      externalFileRoots: { 'ext-1': 'C:/ws/ext' },
    });
    expect(resolveWorkspaceRootForMedia(state, 'ext-1')).toBe('C:/ws/ext');
  });

  it('显式 workspaceId 找不到时不回退当前工作区', () => {
    const state = fakeState({
      appInfo: appInfoWith('C:/ws/current'),
      recentWorkspaces: [WORKSPACE],
      externalFileRoots: {},
    });
    expect(resolveWorkspaceRootForMedia(state, 'gone')).toBeNull();
  });

  it('原型链键（constructor / __proto__）不会命中 externalFileRoots', () => {
    const state = fakeState({
      appInfo: appInfoWith('C:/ws/current'),
      recentWorkspaces: [],
      externalFileRoots: {},
    });
    expect(resolveWorkspaceRootForMedia(state, 'constructor')).toBeNull();
    expect(resolveWorkspaceRootForMedia(state, '__proto__')).toBeNull();
  });
});

describe('requestMediaSource', () => {
  it('根不可解析时报 WORKSPACE_ERROR 且不调用桥接', async () => {
    const mediaSource = vi.fn();
    installBridge(mediaSource);

    const result = await requestMediaSource(
      fakeState({ appInfo: appInfoWith('C:/ws/current'), recentWorkspaces: [] }),
      'gone',
      'a.mp3',
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'WORKSPACE_ERROR' } });
    expect(mediaSource).not.toHaveBeenCalled();
  });

  it('根可解析时把根与相对路径交给桥接', async () => {
    const mediaSource = vi.fn(async () => ({
      ok: true as const,
      data: {
        url: 'http://127.0.0.1/media?path=a.mp3',
        path: 'a.mp3',
        mime: 'audio/mpeg',
        size: 1,
        lastModifiedAt: 0,
      },
    }));
    installBridge(mediaSource);

    const result = await requestMediaSource(
      fakeState({ appInfo: appInfoWith('C:/ws/current'), recentWorkspaces: [WORKSPACE] }),
      'ws-1',
      'a.mp3',
    );

    expect(mediaSource).toHaveBeenCalledWith('C:/ws/one', 'a.mp3');
    expect(result.ok).toBe(true);
  });
});
