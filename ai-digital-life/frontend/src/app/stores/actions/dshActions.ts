import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import { captureError } from '../shared';
const SCOPE = 'dsh';

export function createDshActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [openDsh - 打开中间区 dsh 宿主，拉起 dsh 进程并返回就绪 URL]
     * @reads 无
     * @writes dshSlice.isOpen, dshSlice.url
     * @see httpBridge.ts → dsh.open (/dsh/open)
     * @see mock-bridge.ts → mockDsh.open
     */
    openDsh: async (): Promise<string | null> => {
      const result = await window.digitalLife.dsh.open();
      if (result.ok) {
        const url = result.data ?? null;
        get().setDshOpen(true);
        get().setDshUrl(url);
        return url;
      }
      captureError(get, result.error, SCOPE);
      return null;
    },

    /**
     * [closeDsh - 关闭中间区 dsh 宿主。keep=true 保留进程；keep=false 停进程]
     * @reads dshSlice.isOpen
     * @writes dshSlice.isOpen, dshSlice.url
     * @see httpBridge.ts → dsh.close (/dsh/close)
     * @see mock-bridge.ts → mockDsh.close
     */
    closeDsh: async (keep: boolean): Promise<void> => {
      const result = await window.digitalLife.dsh.close(keep);
      if (result.ok) {
        get().setDshOpen(false);
        get().setDshUrl(null);
      } else {
        captureError(get, result.error, SCOPE);
      }
      get().setDshCloseDialogVisible(false);
    },

    /**
     * [fetchDshVersionStatus - 拉取 dsh 版本目录状态（当前选中/已装/最新/是否有更新）]
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.getVersionStatus (/dsh/get-version-status)
     * @see mock-bridge.ts → mockDsh.getVersionStatus
     */
    fetchDshVersionStatus: async (): Promise<void> => {
      const result = await window.digitalLife.dsh.getVersionStatus();
      if (result.ok) {
        get().setDshVersionStatus(result.data);
      } else {
        captureError(get, result.error, SCOPE);
      }
    },

    /**
     * [updateDsh - 升级 dsh 到最新可用版本，并刷新版本状态]
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.update (/dsh/update)
     * @see mock-bridge.ts → mockDsh.update
     */
    updateDsh: async (): Promise<void> => {
      const result = await window.digitalLife.dsh.update();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
      await get().fetchDshVersionStatus();
    },

    /**
     * [revertDsh - 回退到指定已装版本，并刷新版本状态]
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.revert (/dsh/revert)
     * @see mock-bridge.ts → mockDsh.revert
     */
    revertDsh: async (version: string): Promise<void> => {
      const result = await window.digitalLife.dsh.revert(version);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
      await get().fetchDshVersionStatus();
    },

    /**
     * [uninstallDsh - 卸载 dsh 指定版本，并刷新版本状态]
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.uninstall (/dsh/uninstall)
     * @see mock-bridge.ts → mockDsh.uninstall
     */
    uninstallDsh: async (version: string): Promise<void> => {
      const result = await window.digitalLife.dsh.uninstall(version);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
      await get().fetchDshVersionStatus();
    },

    /**
     * [reinstallDsh - 重装 dsh 最新可用版本，并刷新版本状态]
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.reinstall (/dsh/reinstall)
     * @see mock-bridge.ts → mockDsh.reinstall
     */
    reinstallDsh: async (): Promise<void> => {
      const result = await window.digitalLife.dsh.reinstall();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
      await get().fetchDshVersionStatus();
    },
  };
}
