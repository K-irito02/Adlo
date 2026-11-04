import { useAppStore } from '@stores/slicedStore';
import { sameServiceOrigin } from '@stores/actions/dshActions';
import type { DshSourceStatus, DshVersionSourceMode } from '../../../shared/ipc/dsh';

/**
 * DSH 版本区运行态编排（重启 / 兜底拉起 / 标签清理）。
 *
 * 从旧 DSH 版本组件抽出，供通用版本卡片适配器（`dshVersionBridge`）
 * 与设置组包装层（`DshSettings`）共用；旧组件已随 ticket #5 删除，本文件是
 * 运行态编排的唯一实现。
 */

/** 版本四操作成功 toast 展示时长（默认 3000ms 用户实测中曾错过，见事项 1 注记）。 */
export const VERSION_TOAST_MS = 5000;

/**
 * 卸载到空后关闭残留 dsh 标签：宿主无可用版本且进程已停时，WebView 仍冻结显示
 * 旧页面（用户实测 2026-10-21）。按卸载前运行中 URL 的 origin 同源关闭（含中心
 * 承载标签）；此前无运行中 URL 则无法安全识别，不关（边界如实记录）。
 */
export function closeDshTabsByUrl(url: string | null): number {
  if (!url) {
    return 0;
  }
  const st = useAppStore.getState();
  const doomed = st.browserTabs.filter((tab) => sameServiceOrigin(tab.url, url));
  if (doomed.length === 0) {
    return 0;
  }
  const ids = new Set(doomed.map((t) => t.id));
  for (const t of doomed) {
    st.browserCloseTab(t.id);
  }
  for (const ct of st.centerTabs) {
    if (ct.kind === 'browser' && ct.refId && ids.has(ct.refId)) {
      st.centerRemoveTab(ct.id);
    }
  }
  return doomed.length;
}

/** 重启结果（与 `restartDsh` 的返回同形，`failed` 为前端补充的异常标记）。 */
export interface DshMayRestartResult {
  restarted: boolean;
  url: string | null;
  failed: boolean;
}

/** `ensureDshRunning` 依赖的最小 action 面。 */
export interface DshRuntimeActions {
  restartDsh: () => Promise<DshMayRestartResult>;
  fetchSourceStatus: (silent?: boolean) => Promise<boolean>;
}

/**
 * 操作完成后确保 dsh 在后台运行（用户 2026-10-22 完成态定义：完成态含
 * “后台 dsh 进程已成功启动并正在运行”，运行中才翻转 UI、才弹完成 toast）。
 * - 有运行进程：不动，返回 null（调用方沿用原结果 toast）。
 * - 无运行＋有可用来源：调 restartDsh 拉起，返回拉起结果。
 * - 无可用来源：关闭残留标签，返回 null（调用方按原结果 toast）。
 *
 * @param fallbackUrl 调用方在操作前记下的运行中 URL（如卸载前的 running.url）；
 *   缺省用本会话最近入口 URL。两者皆无则跳过关闭（边界如实记录）。
 */
export async function ensureDshRunning(
  actions: DshRuntimeActions,
  fallbackUrl?: string | null,
): Promise<DshMayRestartResult | null> {
  const st = useAppStore.getState();
  if (st.sourceStatus?.running) {
    return null;
  }
  const effective = st.sourceStatus?.versionSource?.effective ?? null;
  if (effective === 'none') {
    closeDshTabsByUrl(fallbackUrl ?? st.dshLastUrl ?? null);
    return null;
  }
  st.setDshRestarting(true);
  try {
    const result = await actions.restartDsh();
    await actions.fetchSourceStatus(true);
    return result;
  } finally {
    useAppStore.getState().setDshRestarting(false);
  }
}

/**
 * 管理项显隐（与迁移前一致）：偏好为系统安装、偏好解析落在系统安装、
 * 或待切换来源为系统安装，任一成立即隐藏；source-status 未就绪（解析未知）时不显示。
 */
export function dshManageVisible(
  sourceStatus: DshSourceStatus | null,
  pendingSource: DshVersionSourceMode | null,
): boolean {
  const versionSource = sourceStatus?.versionSource ?? null;
  if (!versionSource?.resolvedByMode) {
    return false;
  }
  const mode: DshVersionSourceMode =
    versionSource.mode ?? sourceStatus?.config.version_source ?? 'auto';
  const resolved = versionSource.resolvedByMode[mode] ?? null;
  return !(mode === 'system' || resolved === 'system' || pendingSource === 'system');
}
