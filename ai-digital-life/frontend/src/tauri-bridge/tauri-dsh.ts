import type { DshBridge } from '../shared/ipc/dsh';
import { invokeIpc } from './tauri-shared';

/**
 * Tauri dsh bridge: delegates the dsh business logic (open / close / version
 * management) to the ad-server HTTP `/dsh/*` routes via the httpBridge `dsh`
 * domain, and layers the standalone WebView2 sub-window lifecycle on top:
 *
 *  - `open`: after `http.dsh.open()` returns a ready URL, create the native
 *    `adl-dsh-view-main` webview (routed to the middle region by the backend).
 *  - `close(keep=false)`: after stopping the process, destroy the native webview.
 *
 * The remaining version commands are pure HTTP and are passed through unchanged.
 *
 * @param httpDsh the httpBridge dsh domain (business routes against ad-server)
 */
export function createTauriDshBridge(httpDsh: DshBridge): DshBridge {
  return {
    open: async () => {
      const result = await httpDsh.open();
      if (result.ok && result.data) {
        const created = await invokeIpc<undefined>('browser_create_dsh_view', {
          url: result.data,
        });
        if (!created.ok) {
          // The dsh process is up but the WebView creation failed — surface the
          // backend error so the caller can report it.
          return { ok: false, error: created.error };
        }
      }
      return result;
    },
    close: async (keep: boolean) => {
      const result = await httpDsh.close(keep);
      if (!keep) {
        await invokeIpc<undefined>('browser_destroy_dsh_view');
      }
      return result;
    },
    getVersionStatus: httpDsh.getVersionStatus,
    update: httpDsh.update,
    revert: httpDsh.revert,
    uninstall: httpDsh.uninstall,
    reinstall: httpDsh.reinstall,
  };
}
