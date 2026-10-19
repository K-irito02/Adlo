import type { DshBridge } from '../shared/ipc/dsh';

/**
 * Tauri dsh bridge: delegates the dsh business logic (open / close / version
 * management) to the ad-server HTTP `/dsh/*` routes via the httpBridge `dsh`
 * domain.
 *
 * dsh is displayed as a normal browser center tab (Task 15): the process launch
 * is pure HTTP, and there is no dedicated `adl-dsh-view-main` webview to create
 * or destroy. The browser tab pool owns the WebView lifecycle.
 *
 * @param httpDsh the httpBridge dsh domain (business routes against ad-server)
 */
export function createTauriDshBridge(httpDsh: DshBridge): DshBridge {
  return {
    open: () => httpDsh.open(),
    getVersionStatus: httpDsh.getVersionStatus,
    getVersionCatalog: httpDsh.getVersionCatalog,
    installVersion: httpDsh.installVersion,
    update: httpDsh.update,
    revert: httpDsh.revert,
    uninstall: httpDsh.uninstall,
    reinstall: httpDsh.reinstall,
    getSourceStatus: httpDsh.getSourceStatus,
    saveSourceConfig: httpDsh.saveSourceConfig,
    testSource: httpDsh.testSource,
  };
}
