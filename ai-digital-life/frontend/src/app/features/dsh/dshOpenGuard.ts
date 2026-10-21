import { useAppStore } from '@stores/slicedStore';

/**
 * 版本操作在途判定（两入口共用，R2-G1 去重：CenterEntryPage 与欢迎页分流
 * 原先各写一份 `versionTask != null || dshRestarting`，口径漂移风险）。
 * true = 有版本任务在跑，或重启长尾未结束，或行内操作刚发起
 *（store 级 dshOpBusy 由各 handler 同步置位，覆盖轮询到 versionTask 前约一拍的窗口）。
 */
export function isDshBusySnap(): boolean {
  const st = useAppStore.getState();
  return st.versionTask != null || st.dshRestarting || st.dshOpBusy;
}

/**
 * dsh 打开前置守卫（用户实测 2026-10-21：宿主无任何可用版本时，任何 dsh 专属
 * opener——中间区“打开 deepseek harness”按钮、欢迎页快捷站点/本地端口分流——
 * 都不得建 dsh 标签，必须 toast 提示且界面保持正常）。
 *
 * 新鲜静默拉取源状态后仍 `effective === 'none'` 才拦截。
 * fail-open 语义（精确版）：桥抛异常或拉取失败返回 false 时沿用 store 旧值；
 * 旧值为 null（未知）→ 放行，由后端裁决；旧值已确认为 none → 仍拦截
 *（上次确认的事实在无反证前继续有效，避免每次都打扰后端）。
 * 纯判定，不弹 toast、不记卡片，提示由调用方按语境处理。
 */
export async function isDshConfirmedUnusable(): Promise<boolean> {
  try {
    await useAppStore.getState().fetchSourceStatus(true);
  } catch {
    return false;
  }
  return useAppStore.getState().sourceStatus?.versionSource?.effective === 'none';
}
