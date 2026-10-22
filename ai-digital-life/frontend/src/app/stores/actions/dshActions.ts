import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { DshOpenResult, DshSourceConfig, DshTestResult } from '../../../shared/ipc/dsh';
import { captureError, clearError } from '../shared';
const SCOPE = 'dsh';

/**
 * 版本管理调试埋点（临时）：用户在 Tauri 桌面实测后，凭此前缀在
 * `.adl-logs/debug-logs*.txt` 中定位版本链路日志，核对排查后再删除。
 * 移除义务已登记在 `docs/root-cause-to-close/2026-10/progress-2026-10-19-095312.md`（事项 5）。
 */
function debugVer(message: string, detail?: Record<string, unknown>) {
  console.debug('[ADL-DSH-VER]', message, detail ?? {});
}

/**
 * 两个 URL 是否指向同一个本地服务（**按 origin，含端口**）。
 *
 * 不能复用 `historyDedupKey`——它只用 hostname（**忽略端口**），会把
 * `127.0.0.1:3080` 与 `127.0.0.1:5173` 视为同一个，导致 openDsh 误聚焦错误标签。
 * 只比较 origin（scheme+host+port）：同一 origin 即同一本地服务，路径/query/hash
 * 不参与 —— dsh SPA 路由到子路径后仍复用同一标签，避免产生重复标签。
 *
 * 导出供设置页版本管理块复用（卸载到空后按 origin 关闭残留 dsh 标签）。
 */
export function sameServiceOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return a.trim() === b.trim();
  }
}

/**
 * openDsh 进行中标志（模块级）：快速双击/并发调用时复用同一 promise，
 * 避免重复拉起 dsh 进程与创建多个承载标签。
 */
let openDshInFlight: Promise<DshOpenResult | null> | null = null;

/** applyPendingVersionSource 并发重入守卫（StrictMode 双 effect 安全）。 */
let applyPendingInFlight: Promise<boolean> | null = null;

/** 版本任务轮询只记状态变迁（每 400ms 轮询一次，全量记会刷屏）。 */
let lastVersionTaskSig: string | null = null;

/** 变异成功后的版本状态刷新：best-effort 静默，不记录错误卡片（主操作已成功）。 */
async function refreshVersionStatusSilently(get: () => StoreState): Promise<void> {
  debugVer('refreshVersionStatus: start', {});
  const result = await window.digitalLife.dsh.getVersionStatus();
  if (result.ok) {
    debugVer('refreshVersionStatus: updated', {
      currentSelected: result.data.currentSelected,
      installed: result.data.installed,
    });
    get().setDshVersionStatus(result.data);
    return;
  }
  debugVer('refreshVersionStatus: skipped (not ok)', { error: result.error });
}

/**
 * 重启后重建 dsh 标签（旧地址的 token 已失效）：按原位置逐个重建并导航到新地址。
 * 顺序必须是先开后关：`centerRemoveTab` 在中心变空时会同步补一个 launcher
 * 入口页，先关后开会让中间区瞬间变空，使用户看到多出的入口页
 *（用户实测 2026-10-26）。先开后关则中心永不为空，无此问题。
 * 位置保持：原在中间区的仍回中间区，原在右侧面板的仍留在面板，不劫持用户布局
 *（用户实测 2026-10-26：重装后右侧面板的 dsh 标签不应消失）。
 * 严格逐个配对：开辟失败则保留旧标签，宁可留一个待手动刷新的旧标签也不静默丢标签。
 * 用户没开 dsh 标签时不自动新建（事项 2026-10-20/5：对话框“立即生效”重启
 * 不得在中间区凭空开标签；用户需要时自己点开，openDsh 会复用新进程）。
 */
function syncDshTab(get: () => StoreState, url: string): void {
  const stale = get().browserTabs.filter((tab) => sameServiceOrigin(tab.url, url));
  if (stale.length === 0) {
    debugVer('syncDshTab: skipped (no dsh tab open)', {});
    return;
  }
  // 先开后关、严格逐个配对：每个旧标签先开出替代者再关旧者。
  // 开辟失败（browserOpenTab 未返回新 id，理论上不可达）则保留旧标签，
  // 宁可留一个待手动刷新的旧标签，也不静默丢标签。
  let rebuilt = 0;
  for (const tab of stale) {
    get().browserOpenTab(url);
    const newId = get().browserActiveTabId;
    if (!newId) {
      debugVer('syncDshTab: open returned no tab, keeping stale one', { stale: tab.id });
      continue;
    }
    if (tab.location === 'center') {
      get().centerShowBrowserTab(newId);
    }
    get().browserCloseTab(tab.id);
    rebuilt += 1;
  }
  debugVer('syncDshTab: rebuilt stale tabs in place', { stale: stale.length, rebuilt });
}

export function createDshActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [openDsh - 确保 dsh 进程就绪，并打开/聚焦一个承载它的普通浏览器标签]
     *
     * 「打开 deepseek harness」等价于自动快捷跳转：确保进程就绪后，按 URL 复用已有
     * 标签（聚焦到中心），否则新建一个**普通**浏览器标签并移到中心。该标签不带任何
     * dsh 专属标记 —— 跨重启持久化、关闭不联动停进程、可被正常挂起。
     * @returns 成功返回 `{url, freedPort}`；失败返回 `null` 并已记录全局错误卡片
     * @reads browserSlice.browserTabs, browserSlice.browserActiveTabId, centerTabs
     * @writes browserSlice.browserTabs/browserActiveTabId, centerTabs
     * @see httpBridge.ts → dsh.open (/dsh/open)
     * @see mock-bridge.ts → mockDsh.open
     */
    openDsh: async (): Promise<DshOpenResult | null> => {
      // 并发重入（快速双击）：复用进行中的调用，避免拉起两个进程/创建两个标签。
      if (openDshInFlight) {
        debugVer('openDsh: reusing in-flight call', {});
        return openDshInFlight;
      }
      openDshInFlight = (async () => {
        clearError(get, SCOPE);
        debugVer('openDsh: start', {});
        // 桥调用不吞异常：意外抛错沿旧语义抛给调用方（组件兜底 toast），finally 照常复位在途标记。
        const result = await window.digitalLife.dsh.open();
        if (!result.ok) {
          debugVer('openDsh: failed (error card shown)', { error: result.error });
          captureError(get, result.error, SCOPE);
          return null;
        }
        const data: DshOpenResult = result.data ?? { url: null, freedPort: false };
        const url = data.url?.trim() ?? '';
        debugVer('openDsh: ok, routing tab', {
          hasUrl: url !== '',
          freedPort: data.freedPort,
        });
        if (url) {
          // 记录最近入口（卸载到空后按 origin 同源关残留标签用；token 入口只记到 query 之前）。
          get().setDshLastUrl(url.split('?')[0]);
          const existing = get().browserTabs.find((tab) => sameServiceOrigin(tab.url, url));
          if (existing) {
            const centerTab = get().centerTabs.find(
              (tab) => tab.kind === 'browser' && tab.refId === existing.id,
            );
            if (centerTab) {
              get().centerSelectTab(centerTab.id);
            } else {
              get().centerShowBrowserTab(existing.id);
            }
            return data;
          }
        }
        get().browserOpenTab(url);
        const tabId = get().browserActiveTabId;
        if (tabId) {
          get().centerShowBrowserTab(tabId);
        }
        return data;
      })();
      try {
        return await openDshInFlight;
      } finally {
        openDshInFlight = null;
      }
    },

    /**
     * [restartDsh - 重启正在运行的 dsh，并把承载标签导航到新地址]
     * @returns 重启结果；失败返回 `{ restarted:false, url:null }`
     * @see httpBridge.ts → dsh.restart (/dsh/restart)
     */
    restartDsh: async () => {
      debugVer('restartDsh: start', {});
      get().setDshRestarting(true);
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.restart>>;
      try {
        result = await window.digitalLife.dsh.restart();
      } catch (e) {
        debugVer('restartDsh: threw', { error: String(e) });
        get().setDshRestarting(false);
        return { restarted: false, url: null, failed: true };
      }
      if (!result.ok) {
        debugVer('restartDsh: failed', { error: result.error });
        get().setDshRestarting(false);
        return { restarted: false, url: null, failed: true };
      }
      // 凭据红线：真实入口 URL 含一次性 `?token=`，埋点只记到 query 之前
      // （本文件其它埋点均不带 URL；调试日志收起器会收录 stdout 明文）。
      debugVer('restartDsh: ok', {
        ...result.data,
        url: result.data.url?.split('?')[0] ?? null,
      });
      if (result.data.url) {
        get().setDshLastUrl(result.data.url.split('?')[0]);
        syncDshTab(get, result.data.url);
      }
      get().setDshRestarting(false);
      return { ...result.data, failed: false };
    },

    /**
     * [fetchVersionTask - 拉取当前版本任务进度（安装/卸载/重装）]
     * @writes dshSlice.versionTask
     * @see httpBridge.ts → dsh.getVersionTask (/dsh/version-task)
     */
    fetchVersionTask: async () => {
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.getVersionTask>>;
      try {
        result = await window.digitalLife.dsh.getVersionTask();
      } catch (e) {
        debugVer('fetchVersionTask: bridge threw', { error: String(e) });
        return;
      }
      if (result.ok) {
        const task = result.data.task;
        const sig = task
          ? `${task.kind}@${task.version}:${task.phase}:${task.percent ?? 'na'}`
          : 'null';
        if (sig !== lastVersionTaskSig) {
          debugVer('fetchVersionTask: transition', { from: lastVersionTaskSig, to: sig });
          lastVersionTaskSig = sig;
        }
        get().setDshVersionTask(task);
        return;
      }
      debugVer('fetchVersionTask: not ok', { error: result.error });
    },

    /**
     * [cancelVersionTask - 请求取消当前版本任务]
     * @returns true=取消请求已送达
     * @see httpBridge.ts → dsh.cancelVersionTask (/dsh/cancel-version-task)
     */
    cancelVersionTask: async () => {
      get().setVersionTaskCancelRequested(true);
      debugVer('cancelVersionTask: requested', {});
      try {
        const result = await window.digitalLife.dsh.cancelVersionTask();
        if (!result.ok) {
          // 取消请求未送达：复位标记，否则后续真实错误会被误判为"用户已取消"而吞卡片。
          debugVer('cancelVersionTask: not ok, flag reset', { error: result.error });
          get().setVersionTaskCancelRequested(false);
        } else {
          debugVer('cancelVersionTask: delivered', { delivered: result.data });
        }
        return result.ok;
      } catch (e) {
        debugVer('cancelVersionTask: bridge threw, flag reset', { error: String(e) });
        get().setVersionTaskCancelRequested(false);
        return false;
      }
    },

    /**
     * [fetchDshVersionStatus - 拉取 dsh 版本目录状态（当前选中/已装/最新/是否有更新，含预发布通道）]
     * @returns true=成功；false=失败（非 silent 时已记录全局错误卡片）
     * @param silent 启动自检等后台同步传 true：不碰错误卡片（事项 5：启动每次静默查一次，
     * 设置项内徽章展示结果，不 toast 打扰）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.getVersionStatus (/dsh/get-version-status)
     * @see mock-bridge.ts → mockDsh.getVersionStatus
     */
    fetchDshVersionStatus: async (silent = false): Promise<boolean> => {
      if (!silent) {
        clearError(get, SCOPE);
      }
      debugVer('fetchDshVersionStatus: start', { silent });
      // 桥调用可能抛异常（与 fetchSourceStatus 同口径兜底），
      // 避免挂载路径产生未处理的 promise rejection。
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.getVersionStatus>>;
      try {
        result = await window.digitalLife.dsh.getVersionStatus();
      } catch (e) {
        debugVer('fetchDshVersionStatus: bridge threw', { error: String(e) });
        if (!silent) {
          captureError(get, e, SCOPE);
        }
        return false;
      }
      if (result.ok) {
        debugVer('fetchDshVersionStatus: ok', {
          currentSelected: result.data.currentSelected,
          installed: result.data.installed,
          latestAvailable: result.data.latestAvailable,
          hasUpdate: result.data.hasUpdate,
          prereleaseAvailable: result.data.prereleaseAvailable,
          hasPrereleaseUpdate: result.data.hasPrereleaseUpdate,
        });
        get().setDshVersionStatus(result.data);
        return true;
      }
      debugVer('fetchDshVersionStatus: not ok', { error: result.error });
      if (!silent) {
        captureError(get, result.error, SCOPE);
      }
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
     * [revertDsh - 回退到指定的已装版本，并刷新版本状态]
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.revert (/dsh/revert)
     * @see mock-bridge.ts → mockDsh.revert
     */
    revertDsh: async (version: string): Promise<boolean> => {
      clearError(get, SCOPE);
      debugVer('revertDsh: start', {
        version,
        currentSelected: get().versionStatus?.currentSelected ?? null,
        installed: get().versionStatus?.installed ?? [],
      });
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.revert>>;
      try {
        result = await window.digitalLife.dsh.revert(version);
      } catch (e) {
        debugVer('revertDsh: bridge threw', { version, error: String(e) });
        captureError(get, e, SCOPE);
        return false;
      }
      if (!result.ok) {
        debugVer('revertDsh: failed', { version, error: result.error });
        captureError(get, result.error, SCOPE);
        return false;
      }
      debugVer('revertDsh: ok', { version, selected: result.data });
      await refreshVersionStatusSilently(get);
      return true;
    },

    /**
     * [uninstallDsh - 卸载 dsh 指定版本，并刷新版本状态]
     * 内置预置版本同样是普通已装版本：删除版本目录即可，后端同时清掉「内置」来源记录。
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.uninstall (/dsh/uninstall)
     * @see mock-bridge.ts → mockDsh.uninstall
     */
    uninstallDsh: async (version: string): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setVersionTaskCancelRequested(false);
      debugVer('uninstallDsh: start', {
        version,
        currentSelected: get().versionStatus?.currentSelected ?? null,
        installed: get().versionStatus?.installed ?? [],
      });
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.uninstall>>;
      try {
        result = await window.digitalLife.dsh.uninstall(version);
      } catch (e) {
        debugVer('uninstallDsh: bridge threw', { version, error: String(e) });
        if (!get().versionTaskCancelRequested) {
          captureError(get, e, SCOPE);
        }
        return false;
      }
      if (!result.ok) {
        if (get().versionTaskCancelRequested) {
          debugVer('uninstallDsh: cancelled', { version, error: result.error });
        } else {
          debugVer('uninstallDsh: failed', { version, error: result.error });
          captureError(get, result.error, SCOPE);
        }
        return false;
      }
      debugVer('uninstallDsh: ok', { version });
      await refreshVersionStatusSilently(get);
      debugVer('uninstallDsh: refreshed', {
        version,
        currentSelected: get().versionStatus?.currentSelected ?? null,
        installed: get().versionStatus?.installed ?? [],
      });
      return true;
    },

    /**
     * [reinstallDsh - 按当前选中版本重新登记并选中（校验官方仍在发布），并刷新版本状态]
     * 语义为“修当前版本”，不是“升到最新”（升级走 updateDsh）。
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.reinstall (/dsh/reinstall)
     * @see mock-bridge.ts → mockDsh.reinstall
     */
    reinstallDsh: async (): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setVersionTaskCancelRequested(false);
      const current = get().versionStatus?.currentSelected ?? null;
      debugVer('reinstallDsh: start', { currentSelected: current });
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.reinstall>>;
      try {
        result = await window.digitalLife.dsh.reinstall();
      } catch (e) {
        debugVer('reinstallDsh: bridge threw', { currentSelected: current, error: String(e) });
        if (!get().versionTaskCancelRequested) {
          captureError(get, e, SCOPE);
        }
        return false;
      }
      if (!result.ok) {
        if (get().versionTaskCancelRequested) {
          debugVer('reinstallDsh: cancelled', { currentSelected: current, error: result.error });
        } else {
          debugVer('reinstallDsh: failed', { currentSelected: current, error: result.error });
          captureError(get, result.error, SCOPE);
        }
        return false;
      }
      debugVer('reinstallDsh: ok', { currentSelected: current, reinstalled: result.data });
      await refreshVersionStatusSilently(get);
      return true;
    },

    /**
     * [fetchVersionCatalog - 拉取官方版本目录（正式版/预发布分桶 + 发布时间）]
     * @returns true=成功；false=失败（非 silent 时已记录全局错误卡片）
     * @param silent 后台同步传 true：不碰错误卡片，由调用方决定提示
     * @reads 无
     * @writes dshSlice.versionCatalog
     * @see httpBridge.ts → dsh.getVersionCatalog (/dsh/version-catalog)
     */
    fetchVersionCatalog: async (silent = false): Promise<boolean> => {
      if (!silent) {
        clearError(get, SCOPE);
      }
      debugVer('fetchVersionCatalog: start', { silent });
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.getVersionCatalog>>;
      try {
        result = await window.digitalLife.dsh.getVersionCatalog();
      } catch (e) {
        debugVer('fetchVersionCatalog: bridge threw', { error: String(e) });
        get().setVersionCatalogFailed(true);
        if (!silent) {
          captureError(get, e, SCOPE);
        }
        return false;
      }
      if (result.ok) {
        debugVer('fetchVersionCatalog: ok', {
          stable: result.data.stable.length,
          prerelease: result.data.prerelease.length,
          latestStable: result.data.latestStable,
          latestPrerelease: result.data.latestPrerelease,
        });
        get().setDshVersionCatalog(result.data);
        get().setVersionCatalogFailed(false);
        return true;
      }
      debugVer('fetchVersionCatalog: not ok', { error: result.error });
      get().setVersionCatalogFailed(true);
      if (!silent) {
        captureError(get, result.error, SCOPE);
      }
      return false;
    },

    /**
     * [installDshVersion - 安装指定版本（正式版或预发布均可，需官方确已发布），并刷新版本状态]
     * select 缺省 true（登记并选中）；false 则只修目录、保持原选中（行内“重装非当前”）。
     * 后端登记并选中该版本，下次 open 即按该版本启动。
     * @returns true=成功；false=失败（已记录全局错误卡片）
     * @reads 无
     * @writes dshSlice.versionStatus
     * @see httpBridge.ts → dsh.installVersion (/dsh/install-version)
     */
    installDshVersion: async (version: string, select = true): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setVersionTaskCancelRequested(false);
      debugVer('installDshVersion: start', { version, select });
      // 桥调用可能抛异常（与 fetch 系列同口径兜底），避免未处理的 promise rejection。
      let result: Awaited<ReturnType<typeof window.digitalLife.dsh.installVersion>>;
      try {
        result = await window.digitalLife.dsh.installVersion(version, select);
      } catch (e) {
        debugVer('installDshVersion: bridge threw', { version, select, error: String(e) });
        if (!get().versionTaskCancelRequested) {
          captureError(get, e, SCOPE);
        }
        return false;
      }
      if (!result.ok) {
        debugVer('installDshVersion: failed', { version, select, error: result.error });
        if (!get().versionTaskCancelRequested) {
          captureError(get, result.error, SCOPE);
        }
        return false;
      }
      debugVer('installDshVersion: ok', { version, select, installed: result.data });
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
     * [applyPendingVersionSource - 启动期应用“下次启动生效”的版本来源]
     *
     * 对话框“下次启动生效”只记 pending（localStorage）不写配置，选择器保持显示
     * 当前生效来源；下次启动由 App 挂载时调一次本 action 落盘并静默重启生效。
     * 无 pending 返回 false；并发重入复用同一 promise（StrictMode 双 effect 安全）。
     * @returns true=消费过 pending（无论落盘成败）；false=无 pending
     * @writes dshSlice.dshVersionSourcePending/dshVersionSourceDeferred/sourceStatus
     */
    applyPendingVersionSource: async (): Promise<boolean> => {
      if (applyPendingInFlight) {
        return applyPendingInFlight;
      }
      applyPendingInFlight = (async () => {
        const pending = get().dshVersionSourcePending;
        if (!pending) {
          return false;
        }
        debugVer('pending: applying at startup', { pending });
        const target = pending;
        if (target === get().sourceStatus?.config?.version_source) {
          get().setDshVersionSourcePending(null);
          get().setDshVersionSourceDeferred(false);
          return true;
        }
        const ok = await get().saveSourceConfig({ version_source: target }, true);
        if (!ok) {
          // 落盘失败：pending 保留，下次启动重试（本次不打扰用户）。
          debugVer('pending: save failed, will retry next launch', { target });
          return true;
        }
        get().setDshVersionSourcePending(null);
        get().setDshVersionSourceDeferred(false);
        // 静默重启（事项 2026-10-20/5：不自动开标签，无 tab 时 syncDshTab 直接跳过）；
        // 失败只记埋点（启动期不弹 toast 打扰；配置已落盘，用户手动重启即生效）。
        const restart = await get().restartDsh();
        await get().fetchSourceStatus(true);
        if (restart.failed) {
          debugVer('pending: restart failed after save', { target });
        }
        return true;
      })();
      try {
        return await applyPendingInFlight;
      } finally {
        applyPendingInFlight = null;
      }
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
