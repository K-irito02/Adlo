import { useCallback, useEffect, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';
import { createDshVersionBridge } from './dshVersionBridge';
import { useDshGroupReset } from './useDshGroupReset';
import { useDshSourceSwitch } from './useDshSourceSwitch';
import { VERSION_TOAST_MS } from './dshVersionRuntime';

/**
 * DSH 设置组的状态编排：运行态轮询、聚合信号、来源切换对话框与组级恢复。
 * 渲染交给 `DshSettings` 与子组件，hook 本身不返回 JSX。
 *
 * 历史注意：这里曾有「auto→宿主」自动兜底写入，已于 2026-10-30 移除（见下方说明），
 * 版本来源永远只由用户显式改动。
 */
export function useDshSettings() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const showToast = useAppStore((s) => s.showToast);
  const setDshBlocksAtDefault = useAppStore((s) => s.setDshBlocksAtDefault);
  const deferredSource = useAppStore((s) => s.dshVersionSourceDeferred);
  const dshFastPoll = useAppStore((s) => s.dshRestarting || s.sourceStatus?.starting === true);

  // 卸载兜底：pending 置位后若组件在消费前卸载，清信号避免下次挂载「迟到弹窗」。
  useEffect(
    () => () => {
      useAppStore.getState().consumeDshGroupReset();
    },
    [],
  );

  // 源状态缺失时自行静默拉取（直接落到 DSH 组时摘要也要有数据）。
  useEffect(() => {
    if (useAppStore.getState().sourceStatus === null) {
      void actions.fetchSourceStatus(true);
    }
  }, [actions]);

  // 轻量运行状态轮询（外部进程无法发事件，只能低频兜底）；页面隐藏时暂停。
  useEffect(() => {
    const tick = () => {
      if (document.hidden) {
        return;
      }
      void actions.fetchDshRunning(true);
    };
    const id = window.setInterval(tick, dshFastPoll ? 1000 : 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [actions, dshFastPoll]);

  // 聚合信号：版本来源=自动 → 默认（供侧边栏 DSH 行禁用）；sourceStatus 未知时 fail-open。
  const versionSourceAtDefault = (sourceStatus?.config.version_source ?? 'auto') === 'auto';
  useEffect(() => {
    setDshBlocksAtDefault(sourceStatus !== null && versionSourceAtDefault);
  }, [sourceStatus, versionSourceAtDefault, setDshBlocksAtDefault]);

  const notify = useCallback(
    (message: string, tone: 'success' | 'warning' | 'error') => {
      // 版本操作成功提示沿用 DSH 的 5s 长展示（默认 3s 用户实测中曾错过）。
      showToast(message, tone, undefined, VERSION_TOAST_MS);
    },
    [showToast],
  );

  const sourceSwitch = useDshSourceSwitch({ actions, t, showToast });
  const groupReset = useDshGroupReset({ actions, t, showToast });

  const rawBridge = typeof window !== 'undefined' ? window.digitalLife?.dsh : undefined;

  const bridge = useMemo(
    () =>
      createDshVersionBridge({
        bridge: rawBridge,
        toolName: t.settingsDsh,
        t,
        actions,
        notify,
        changeSourceMode: sourceSwitch.changeSourceMode,
      }),
    [rawBridge, t, actions, notify, sourceSwitch.changeSourceMode],
  );

  // 已移除 auto→host 自动改写（用户实测 2026-10-30）：`auto` 的解析优先级本来就是
  // 宿主 > 系统 > 无，没有任何版本时 `host` 同样解析为 none —— 这次改写既不能拉起
  // 助手，还会把用户选择的「自动检测」悄悄改成「宿主托管」，与「下拉始终显示用户
  // 选择、真实结果由蓝色提示行说明」的约定冲突。
  const versionSource = sourceStatus?.versionSource ?? null;

  const mode: DshVersionSourceMode =
    versionSource?.mode ?? sourceStatus?.config.version_source ?? 'auto';
  const resolvedSource = versionSource?.resolvedByMode?.[mode] ?? null;
  // 运行时实际来源（可能为 running）：外部进程在跑时状态行显示「运行中」，
  // 应用自启的托管版本仍按偏好来源显示宿主托管/系统安装。
  const effectiveSource = versionSource?.effective ?? null;
  const runningSource = sourceStatus?.running?.source ?? null;
  // 显隐：配置为系统 / 偏好解析落在系统 → 视为「版本交给系统维护」（说明文案用）。
  // 注意：这里**不**包含「待切换为系统」（pending）—— 下次启动才生效时，现在实际
  // 用的仍是原来源，蓝色状态行与系统托管说明不能提前声称已是系统安装。
  // 与卡片隐藏「当前版本」行的 `systemManaged`（系统安装真实生效）刻意分开命名，
  // 后者允许「钉住系统但本机没有副本」仍显示当前版本行。
  const systemPinned = mode === 'system' || resolvedSource === 'system';

  return {
    t,
    bridge,
    sourceStatus,
    deferredSource,
    systemPinned,
    resolvedSource,
    effectiveSource,
    runningSource,
    mode,
    sourceSwitch,
    groupReset,
  };
}
