import { useCallback, useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type {
  HarnessVersionBridge,
  HarnessVersionMutation,
  HarnessVersionResult,
  HarnessVersionSourceMode,
} from '../harnessVersionBridge';

type Run = (
  action: () => Promise<HarnessVersionResult>,
  successMessage: string | null,
  mutation?: HarnessVersionMutation,
) => Promise<void>;

interface Options<TSource> {
  bridge: HarnessVersionBridge<TSource>;
  run: Run;
  current: string | null;
  latestAvailable: string | null;
}

/**
 * 版本卡片的动作面：安装（含手动版本号）、卸载（当前版本二次确认）、
 * 来源切换与行内重装。每个动作只做参数整理，忙碌/提示/刷新统一交给 `run`。
 */
export function useHarnessVersionActions<TSource>({
  bridge,
  run,
  current,
  latestAvailable,
}: Options<TSource>) {
  const { t } = useTCopy();
  const [stablePick, setStablePick] = useState('');
  const [manual, setManual] = useState('');
  const [uninstallArmed, setUninstallArmed] = useState<string | null>(null);

  // 下拉框默认跟随当前版本 / 通道最新（与迁移前一致）。
  useEffect(() => {
    setStablePick((previous) => previous || current || latestAvailable || '');
  }, [current, latestAvailable]);

  // 当前版本变化（安装/切换完成）后解除确认态，避免确认按钮停在被替换的版本上。
  useEffect(() => {
    setUninstallArmed(null);
  }, [current]);

  const installVersion = useCallback(
    (version: string) => {
      const trimmed = version.trim();
      if (!trimmed) {
        return;
      }
      void run(() => bridge.install(trimmed), t.harnessVersionInstallStarted, 'install');
    },
    [bridge, run, t],
  );

  const installManual = useCallback(() => {
    installVersion(manual);
    setManual('');
  }, [installVersion, manual]);

  const handleUninstall = useCallback(
    (version: string) => {
      if (
        bridge.capabilities?.uninstallConfirm &&
        version === current &&
        uninstallArmed !== version
      ) {
        setUninstallArmed(version);
        return;
      }
      setUninstallArmed(null);
      void run(() => bridge.uninstall(version), t.harnessVersionUninstalled, 'uninstall');
    },
    [bridge, current, run, t, uninstallArmed],
  );

  const handleSourceChange = useCallback(
    (mode: HarnessVersionSourceMode) => {
      const deferredChange = bridge.changeSourceMode;
      if (bridge.capabilities?.sourceModeChange === 'deferred' && deferredChange) {
        // 延迟确认模式：对话框、立即/下次启动语义与提示都由适配器拥有。
        void run(() => deferredChange(mode), null);
        return;
      }
      void run(() => bridge.saveSourceMode(mode), t.harnessVersionSourceSaved);
    },
    [bridge, run, t],
  );

  /** 行内重装：当前版本走真重装；已装非当前版本只修目录、不改选中。 */
  const handleVersionReinstall = useCallback(
    (version: string) => {
      if (version === current) {
        void run(() => bridge.reinstall(), t.harnessVersionReinstalled, 'reinstall');
        return;
      }
      if (bridge.reinstallVersion) {
        void run(() => bridge.reinstallVersion(version), null);
        return;
      }
      void run(() => bridge.install(version), t.harnessVersionInstallStarted, 'install');
    },
    [bridge, current, run, t],
  );

  return {
    stablePick,
    setStablePick,
    manual,
    setManual,
    installVersion,
    installManual,
    uninstallArmed,
    handleUninstall,
    handleSourceChange,
    handleVersionReinstall,
  };
}
