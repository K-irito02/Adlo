import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';
import { createDshVersionBridge } from './dshVersionBridge';
import { useDshGroupReset } from './useDshGroupReset';
import { useDshSourceSwitch } from './useDshSourceSwitch';
import { VERSION_TOAST_MS } from './dshVersionRuntime';

/**
 * DSH 设置组的状态编排：运行态轮询、聚合信号、auto→宿主兜底、来源切换对话框
 * 与组级恢复。渲染交给 `DshSettings` 与子组件，hook 本身不返回 JSX。
 */
export function useDshSettings() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const versionStatus = useAppStore((s) => s.versionStatus);
  const showToast = useAppStore((s) => s.showToast);
  const setDshBlocksAtDefault = useAppStore((s) => s.setDshBlocksAtDefault);
  const deferredSource = useAppStore((s) => s.dshVersionSourceDeferred);
  const pendingSource = useAppStore((s) => s.dshVersionSourcePending);
  const setPendingSource = useAppStore((s) => s.setDshVersionSourcePending);
  const setDeferredSource = useAppStore((s) => s.setDshVersionSourceDeferred);
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

  // auto → 宿主自动切换（迁移前的兜底）：自动检测无可用来源且没有任何已装版本时，
  // 落盘宿主来源一次，避免助手永远拉不起来。
  const versionSource = sourceStatus?.versionSource ?? null;
  const autoSource = versionSource;
  const autoSwitchedRef = useRef(false);
  useEffect(() => {
    if (!autoSource || autoSource.mode !== 'auto') {
      autoSwitchedRef.current = false;
      return;
    }
    if (autoSource.effective !== 'none') {
      return;
    }
    if (!versionStatus || versionStatus.installed.length > 0) {
      return;
    }
    if (autoSwitchedRef.current) {
      return;
    }
    autoSwitchedRef.current = true;
    void (async () => {
      const ok = await actions.saveSourceConfig({ version_source: 'host' }, true);
      if (ok) {
        setPendingSource(null);
        setDeferredSource(false);
      }
    })();
  }, [autoSource, versionStatus, actions, setPendingSource, setDeferredSource]);

  const mode: DshVersionSourceMode =
    versionSource?.mode ?? sourceStatus?.config.version_source ?? 'auto';
  const resolvedSource = versionSource?.resolvedByMode?.[mode] ?? null;
  // 显隐：配置为系统 / 偏好解析落在系统 / 待切换为系统，任一成立即视为系统托管。
  const systemManaged =
    mode === 'system' || resolvedSource === 'system' || pendingSource === 'system';

  return {
    t,
    bridge,
    sourceStatus,
    deferredSource,
    systemManaged,
    resolvedSource,
    mode,
    sourceSwitch,
    groupReset,
  };
}
