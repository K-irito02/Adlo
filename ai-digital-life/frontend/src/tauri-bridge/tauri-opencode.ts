import type { OpencodeBridge } from '../shared/ipc/opencode';

/** Tauri OpenCode bridge：版本管理全部委托 ad-server 的 `/opencode/*` 路由。 */
export function createTauriOpencodeBridge(httpOpencode: OpencodeBridge): OpencodeBridge {
  return {
    getVersionTask: httpOpencode.getVersionTask,
    cancelVersionTask: httpOpencode.cancelVersionTask,
    getVersionStatus: httpOpencode.getVersionStatus,
    getVersionCatalog: httpOpencode.getVersionCatalog,
    installVersion: httpOpencode.installVersion,
    update: httpOpencode.update,
    revert: httpOpencode.revert,
    uninstall: httpOpencode.uninstall,
    reinstall: httpOpencode.reinstall,
    getSourceStatus: httpOpencode.getSourceStatus,
    saveVersionSource: httpOpencode.saveVersionSource,
  };
}
