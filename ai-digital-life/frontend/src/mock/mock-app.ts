import type { AppBridge } from "../shared/ipc";
import { applyPreferencePatch } from "../shared/preferencesMerger";
import { appInfo, currentWorkspaceMeta, onMockStateChange } from "./mock-shared";

export const mockApp: AppBridge = {
  getInfo: async () => ({
    ok: true,
    data: { ...appInfo, currentWorkspace: currentWorkspaceMeta },
  }),
  getHealth: async () => ({
    ok: true,
    data: {
      timestamp: Date.now(),
      components: [
        { name: 'main', status: 'healthy', detail: 'Tauri backend ready', updatedAt: Date.now() },
        {
          name: 'worker',
          status: 'healthy',
          detail: 'Background runtime ready',
          updatedAt: Date.now(),
        },
        {
          name: 'storage',
          status: 'healthy',
          detail: 'SQLite state ready',
          updatedAt: Date.now(),
        },
        {
          name: 'recovery',
          status: 'healthy',
          detail: 'No recovery required',
          updatedAt: Date.now(),
        },
        {
          name: 'migration',
          status: 'healthy',
          detail: 'No migration pending',
          updatedAt: Date.now(),
        },
      ],
    },
  }),
  getDiagnostics: async () => ({
    ok: true,
    data: {
      lifecycle: {
        currentStartedAt: Date.now() - 60_000,
        lastShutdownWasClean: true,
        recoveredFromCrash: false,
      },
      migration: {
        change: 'none',
        toVersion: '0.1.0',
        executedScripts: [],
      },
      events: {
        emitted: 3,
        byType: {
          'app.initialized': 1,
          'workspace.opened': 1,
          'task.upserted': 1,
        },
      },
      recentErrors: [],
    },
  }),
  updatePreferences: async (patch) => {
    const nextConfig = applyPreferencePatch(appInfo.config, patch);
    appInfo.config = nextConfig;
    onMockStateChange?.();
    // mock 无 CLI 会话覆盖概念：锁定集恒为空（与桌面/真实后端行为一致的形状）。
    return {
      ok: true,
      data: {
        info: { ...appInfo, currentWorkspace: currentWorkspaceMeta },
        sessionLockedFields: [],
      },
    };
  },
};
