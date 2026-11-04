import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';
import type { CopyDict } from '@i18n/types';
import type { HarnessVersionResult } from '@features/harness/harnessVersionBridge';
import type { DshSettingsActions } from './dshSettingsTypes';
import { closeDshTabsByUrl } from './dshVersionRuntime';

/** 来源切换确认框的冻结上下文（打开时定格，避免切源流程中文案中途翻转）。 */
export interface DshSourceSwitchState {
  mode: DshVersionSourceMode;
  /** 当前来源解析为空（如空宿主）→ 用「从无版本恢复为可用来源」文案。 */
  fromEmpty: boolean;
  /** 目标来源解析为空 → 追加「切换后无版本可用」的后果说明。 */
  targetEmpty: boolean;
}

interface UseDshSourceSwitchOptions {
  actions: Pick<DshSettingsActions, 'saveSourceConfig' | 'fetchSourceStatus' | 'restartDsh'>;
  t: CopyDict;
  showToast: (message: string, tone: 'success' | 'warning' | 'error') => void;
}

/** 来源切换确认框 + 立即/下次启动语义（原 DshSettings 内的编排原样搬出）。 */
export function useDshSourceSwitch(options: UseDshSourceSwitchOptions) {
  const { actions, t, showToast } = options;
  const setPendingSource = useAppStore((s) => s.setDshVersionSourcePending);
  const setDeferredSource = useAppStore((s) => s.setDshVersionSourceDeferred);

  const [sourceSwitch, setSourceSwitch] = useState<DshSourceSwitchState | null>(null);
  const [sourceSwitchBusy, setSourceSwitchBusy] = useState(false);
  const sourceSwitchResolve = useRef<((result: HarnessVersionResult) => void) | null>(null);
  const sourceSwitchCancelRef = useRef<HTMLButtonElement | null>(null);

  const saveVersionSource = useCallback(
    async (mode: DshVersionSourceMode): Promise<boolean> => {
      const ok = await actions.saveSourceConfig({ version_source: mode }, true);
      if (!ok) {
        showToast(t.dshSettingsSaveFailed, 'error');
        return false;
      }
      // 直接落盘即「本次生效」，清掉可能残留的下次启动 pending。
      setPendingSource(null);
      setDeferredSource(false);
      await actions.fetchSourceStatus(true);
      return true;
    },
    [actions, setPendingSource, setDeferredSource, showToast, t],
  );

  const finishSourceSwitch = useCallback((result: HarnessVersionResult) => {
    const resolve = sourceSwitchResolve.current;
    sourceSwitchResolve.current = null;
    setSourceSwitch(null);
    setSourceSwitchBusy(false);
    resolve?.(result);
  }, []);

  /**
   * 卡片来源选择器的唯一入口：切向系统但未检测到系统安装 → 只提示；解析结果与
   * 当前一致 → 直接保存；确实不同 → 弹确认框，Promise 在用户选择后才 resolve。
   */
  const changeSourceMode = useCallback(
    (mode: DshVersionSourceMode): Promise<HarnessVersionResult> =>
      (async () => {
        await actions.fetchSourceStatus(true);
        const fresh = useAppStore.getState().sourceStatus;
        const currentMode: DshVersionSourceMode =
          fresh?.versionSource?.mode ?? fresh?.config?.version_source ?? 'auto';
        if (mode === 'system' && !fresh?.system) {
          showToast(t.dshSystemMissing, 'error');
          return { ok: true };
        }
        const currentResolved = fresh?.versionSource?.resolvedByMode?.[currentMode] ?? 'none';
        const targetResolved = fresh?.versionSource?.resolvedByMode?.[mode] ?? 'none';
        if (targetResolved === currentResolved) {
          const ok = await saveVersionSource(mode);
          return ok ? { ok: true } : { ok: false, silent: true };
        }
        setSourceSwitch({
          mode,
          fromEmpty: currentResolved === 'none',
          targetEmpty: targetResolved === 'none',
        });
        return new Promise<HarnessVersionResult>((resolve) => {
          sourceSwitchResolve.current = resolve;
        });
      })(),
    [actions, saveVersionSource, showToast, t],
  );

  /**
   * 确认对话框三选项：下次启动只记 pending；立即生效落盘 + 清 pending + 重启
   * （切到空来源时按切换前地址关闭残留标签）；取消按历史语义回退/保持。
   */
  const handleSourceSwitchChoice = useCallback(
    async (choice: 'next' | 'now' | 'cancel') => {
      if (sourceSwitchBusy || !sourceSwitch) {
        return;
      }
      const target = sourceSwitch.mode;
      if (choice === 'cancel') {
        setDeferredSource(false);
        if (target === 'system' && !sourceSwitch.fromEmpty) {
          await saveVersionSource('host');
        }
        finishSourceSwitch({ ok: true });
        return;
      }
      if (choice === 'next') {
        setPendingSource(target);
        setDeferredSource(true);
        showToast(t.dshVersionSourceNextLaunchSaved, 'success');
        finishSourceSwitch({ ok: true });
        return;
      }
      setSourceSwitchBusy(true);
      try {
        const rawPreSwitchUrl =
          useAppStore.getState().sourceStatus?.running?.url ??
          useAppStore.getState().dshLastUrl ??
          null;
        const preSwitchUrl = rawPreSwitchUrl?.split('?')[0] ?? null;
        if (!(await saveVersionSource(target))) {
          finishSourceSwitch({ ok: false, silent: true });
          return;
        }
        const targetResolved =
          useAppStore.getState().sourceStatus?.versionSource?.resolvedByMode?.[target] ?? 'none';
        const restart = await actions.restartDsh();
        await actions.fetchSourceStatus(true);
        if (targetResolved === 'none') {
          closeDshTabsByUrl(preSwitchUrl);
        }
        showToast(
          restart.failed ? t.dshRestartFailed : t.dshVersionSourceSwitched,
          restart.failed ? 'error' : 'success',
        );
        finishSourceSwitch({ ok: true });
      } finally {
        setSourceSwitchBusy(false);
      }
    },
    [
      actions,
      sourceSwitchBusy,
      sourceSwitch,
      setPendingSource,
      setDeferredSource,
      saveVersionSource,
      showToast,
      t,
      finishSourceSwitch,
    ],
  );

  // Escape 仅关闭对话框，不做任何写入。
  useEffect(() => {
    if (!sourceSwitch) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || sourceSwitchBusy) {
        return;
      }
      event.preventDefault();
      finishSourceSwitch({ ok: true });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sourceSwitch, sourceSwitchBusy, finishSourceSwitch]);

  useEffect(() => {
    if (sourceSwitch) {
      sourceSwitchCancelRef.current?.focus();
    }
  }, [sourceSwitch]);

  return {
    sourceSwitch,
    sourceSwitchBusy,
    sourceSwitchCancelRef,
    saveVersionSource,
    changeSourceMode,
    handleSourceSwitchChoice,
    finishSourceSwitch,
  };
}
