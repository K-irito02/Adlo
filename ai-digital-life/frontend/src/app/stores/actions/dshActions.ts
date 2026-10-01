import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { DshOpenResult, DshSourceConfig, DshTestResult } from '../../../shared/ipc/dsh';
import { captureError, clearError } from '../shared';
const SCOPE = 'dsh';

/**
 * openDsh 进行中标志（模块级）：快速双击/并发调用时复用同一 promise，
 * 避免重复拉起 dsh 进程与创建多个 isDsh 标签。
 */
let openDshInFlight: Promise<DshOpenResult | null> | null = null;

/** 变异成功后的版本状态刷新：best-effort 静默，不记录错误卡片（主操作已成功）。 */
async function refreshVersionStatusSilently(get: () => StoreState): Promise<void> {
  const result = await window.digitalLife.dsh.getVersionStatus();
  if (result.ok) {
    get().setDshVersionStatus(result.data);
  }
}

export function createDshActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [openDsh - 拉起 dsh 进程，并把它显示为一个普通浏览器中心标签]
     * @returns 成功返回 `{url, freedPort}`；失败返回 `null` 并已记录全局错误卡片
     * @reads 无
     * @writes dshSlice.isOpen, dshSlice.url, browserSlice.browserTabs/browserActiveTabId, centerTabs
     * @see httpBridge.ts → dsh.open (/dsh/open)
     * @see mock-bridge.ts → mockDsh.open
     */
    openDsh: async (): Promise<DshOpenResult | null> => {
      // 并发重入（快速双击）：复用进行中的调用，避免拉起两个进程/创建两个标签。
      if (openDshInFlight) {
        return openDshInFlight;
      }
      // 已有 isDsh 标签：聚焦它（已居中则重新选中该中心标签，否则移入中心），
      // 不新建标签、不重复拉起进程（dsh.open 幂等但双击仍会产生第二个标签）。
      const existing = get().browserTabs.find((tab) => tab.isDsh);
      if (existing) {
        clearError(get, SCOPE);
        get().setDshOpen(true);
        const centerTab = get().centerTabs.find(
          (tab) => tab.kind === 'browser' && tab.refId === existing.id,
        );
        if (centerTab) {
          get().centerSelectTab(centerTab.id);
        } else {
          get().centerShowBrowserTab(existing.id);
        }
        return { url: existing.url, freedPort: false };
      }
      openDshInFlight = (async () => {
        clearError(get, SCOPE);
        const result = await window.digitalLife.dsh.open();
        if (result.ok) {
          const data: DshOpenResult = result.data ?? { url: null, freedPort: false };
          get().setDshOpen(true);
          get().setDshUrl(data.url);
          // dsh 统一为普通浏览器中心标签：拉起进程后创建承载标签并标记 isDsh
          //（关闭标签时联动停进程，见 useBrowserTabs / CenterTabStrip）。
          // 浏览器池的 create 路径会自行建立 WebView，无需再 bump 桥接条 z-order。
          get().browserOpenTab(data.url ?? '', 'dsh');
          const tabId = get().browserActiveTabId;
          if (tabId) {
            get().browserUpdateTab(tabId, { isDsh: true });
            get().centerShowBrowserTab(tabId);
          }
          return data;
        }
        captureError(get, result.error, SCOPE);
        return null;
      })();
      try {
        return await openDshInFlight;
      } finally {
        openDshInFlight = null;
      }
    },
    /**
     * [closeDsh - 关闭中间区 dsh 宿主。keep=true 保留进程；keep=false 停进程]
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads dshSlice.isOpen
     * @writes dshSlice.isOpen, dshSlice.url
     * @see httpBridge.ts → dsh.close (/dsh/close)
     * @see mock-bridge.ts → mockDsh.close
     */
    closeDsh: async (keep: boolean): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.dsh.close(keep);
      if (result.ok) {
        get().setDshOpen(false);
        get().setDshUrl(null);
        get().setDshCloseDialogVisible(false);
        return true;
      }
      captureError(get, result.error, SCOPE);
      get().setDshCloseDialogVisible(false);
      return false;
    },

    /**
     * [fetchDshVersionStatus - 拉取 dsh 版本目录状态（当前选中/已装/最新/是否有更新）]
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.getVersionStatus (/dsh/get-version-status)
     * @see mock-bridge.ts → mockDsh.getVersionStatus
     */
    fetchDshVersionStatus: async (): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.dsh.getVersionStatus();
      if (result.ok) {
        get().setDshVersionStatus(result.data);
        return true;
      }
      captureError(get, result.error, SCOPE);
      return false;
    },

    /**
     * [updateDsh - 升级 dsh 到最新可用版本，并刷新版本状态]
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.update (/dsh/update)
     * @see mock-bridge.ts → mockDsh.update
     */
    updateDsh: async (): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.dsh.update();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      await refreshVersionStatusSilently(get);
      return true;
    },

    /**
     * [revertDsh - 回退到指定已装版本，并刷新版本状态]
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.revert (/dsh/revert)
     * @see mock-bridge.ts → mockDsh.revert
     */
    revertDsh: async (version: string): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.dsh.revert(version);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      await refreshVersionStatusSilently(get);
      return true;
    },

    /**
     * [uninstallDsh - 卸载 dsh 指定版本，并刷新版本状态]
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.uninstall (/dsh/uninstall)
     * @see mock-bridge.ts → mockDsh.uninstall
     */
    uninstallDsh: async (version: string): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.dsh.uninstall(version);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      await refreshVersionStatusSilently(get);
      return true;
    },

    /**
     * [reinstallDsh - 重装 dsh 最新可用版本，并刷新版本状态]
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.reinstall (/dsh/reinstall)
     * @see mock-bridge.ts → mockDsh.reinstall
     */
    reinstallDsh: async (): Promise<boolean> => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.dsh.reinstall();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return false;
      }
      await refreshVersionStatusSilently(get);
      return true;
    },

    /**
     * [fetchSourceStatus - 拉取 dsh 下载源状态（bundled / system / running / config）]
     * @returns true=成功；false=失败（非 silent 时已记录全局错误卡片）
     * @param silent 后台同步（设置页挂载拉取）传 true：不碰错误卡片（既不记新的，
     * 也不清用户主动操作留下的旧卡。事项 11 Phase 4 A1-L2）。
     * 旧 UI 挂载零调用，进组重复弹窗是回归；fail-open 表单 + 主动操作各自报错已足够。
     * @reads 无
     * @writes dshSlice.sourceStatus
     * @see httpBridge.ts → dsh.getSourceStatus (/dsh/source-status)
     */
    fetchSourceStatus: async (silent = false): Promise<boolean> => {
      if (!silent) {
        clearError(get, SCOPE);
      }
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.getSourceStatus>>;
      try {
        result = await window.digitalLife.dsh.getSourceStatus();
      } catch (e) {
        // 桥本身抛异常（缺失/崩溃）：按失败处理，silent 下不记卡（收尾 F2）。
        if (!silent) {
          captureError(get, e, SCOPE);
        }
        return false;
      }
      if (result.ok) {
        get().setDshSourceStatus(result.data);
        return true;
      }
      if (!silent) {
        captureError(get, result.error, SCOPE);
      }
      return false;
    },

    /**
     * [saveSourceConfig - 保存 dsh 下载源配置（npm registry / mirror / proxy）]
     * @returns true=成功；false=失败（非 silent 时已记录全局错误卡片）
     * @param silent 后台自动保存传 true：失败仅由调用方 toast，不记全局错误卡片
     * （避免与 toast 双通道并存。收尾 F8）。
     * @reads 无
     * @writes dshSlice.sourceStatus（保存后自动刷新）
     * @see httpBridge.ts → dsh.saveSourceConfig (/dsh/source-config)
     */
    saveSourceConfig: async (config: DshSourceConfig, silent = false): Promise<boolean> => {
      if (!silent) {
        clearError(get, SCOPE);
      }
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.saveSourceConfig>>;
      try {
        result = await window.digitalLife.dsh.saveSourceConfig(config);
      } catch (e) {
        if (!silent) {
          captureError(get, e, SCOPE);
        }
        return false;
      }
      if (!result.ok) {
        if (!silent) {
          captureError(get, result.error, SCOPE);
        }
        return false;
      }
      // 保存成功后自动刷新源状态
      const statusResult = await window.digitalLife.dsh.getSourceStatus();
      if (statusResult.ok) {
        get().setDshSourceStatus(statusResult.data);
      }
      return true;
    },

    /**
     * [testSource - 测试指定下载源 URL 的可达性和延迟]
     * @returns DshTestResult | null（null 表示请求失败，非 silent 时已记录错误卡片）
     * @param silent 后台实测（自动检测）传 true：不碰错误卡片（既不记新的，也不清旧卡），
     * 由调用方按 silent 语义决定是否提示。
     * @reads 无
     * @writes 无
     * @see httpBridge.ts → dsh.testSource (/dsh/test-source)
     */
    testSource: async (url: string, silent = false): Promise<DshTestResult | null> => {
      if (!silent) {
        clearError(get, SCOPE);
      }
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.testSource>>;
      try {
        result = await window.digitalLife.dsh.testSource(url);
      } catch (e) {
        if (!silent) {
          captureError(get, e, SCOPE);
        }
        return null;
      }
      if (result.ok) {
        return result.data;
      }
      if (!silent) {
        captureError(get, result.error, SCOPE);
      }
      return null;
    },
  };
}
