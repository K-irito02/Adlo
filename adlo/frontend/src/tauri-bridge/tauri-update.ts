import type { AppUpdateCheckResult, AppUpdateProgress, UpdateBridge } from '../shared/ipc/update';
import { invokeIpc, subscribeChannel } from './tauri-shared';

/** 桌面壳的更新桥接：三个命令 + 两个事件通道。 */
export function createTauriUpdateBridge(): UpdateBridge {
  return {
    supported: true,
    check: () => invokeIpc<AppUpdateCheckResult>('app_update_check'),
    download: () => invokeIpc<void>('app_update_download'),
    install: () => invokeIpc<void>('app_update_install'),
    onProgress: (listener) =>
      subscribeChannel<AppUpdateProgress>('digital-life://app-update-progress', listener),
    onInstalling: (listener) =>
      subscribeChannel<null>('digital-life://app-update-installing', () => {
        listener();
      }),
  };
}
