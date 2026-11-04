import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { executeDshResetPlan } from '@shared/settings-reset/dshReset';
import { formatT } from '@i18n/formatT';
import type { CopyDict } from '@i18n/types';
import type { DshSettingsActions } from './dshSettingsTypes';

interface Options {
  actions: Pick<DshSettingsActions, 'saveSourceConfig'>;
  t: CopyDict;
  showToast: (message: string, tone: 'success' | 'warning' | 'error') => void;
}

/**
 * 组级「恢复默认」：承接 store 的 pending 信号开自有确认框，确认后只写版本来源
 * （源/代理归网络组单计划）。乐观执行：点确认立刻关框，后台一次写入。
 */
export function useDshGroupReset({ actions, t, showToast }: Options) {
  const pending = useAppStore((s) => s.dshGroupResetPending);
  const consumePending = useAppStore((s) => s.consumeDshGroupReset);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openDialog = useCallback(() => {
    // 守卫先行：组框已开/执行中 → 不消费 pending，框关闭后 effect 重试。
    if (open || busy) {
      return;
    }
    consumePending();
    setOpen(true);
  }, [busy, consumePending, open]);

  useEffect(() => {
    if (pending) {
      openDialog();
    }
  }, [pending, openDialog]);

  const confirm = useCallback(() => {
    if (busy) {
      return;
    }
    setBusy(true);
    setOpen(false);
    void (async () => {
      try {
        const save = {
          saveSourceConfig: (cfg: Parameters<typeof actions.saveSourceConfig>[0]) =>
            actions.saveSourceConfig(cfg),
        };
        const result = await executeDshResetPlan(save);
        if (!result.ok) {
          showToast(t.dshSettingsSaveFailed, 'error');
          return;
        }
        showToast(t.settingsResetComplete, 'success');
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, actions, showToast, t]);

  // 取消无执行中守卫：组确认乐观先关框，busy 为 true 时对话框已卸载。
  const cancel = useCallback(() => {
    setOpen(false);
  }, []);

  return {
    open,
    title: formatT(t, 'settingsResetGroupConfirmTitle', { group: t.settingsDsh }),
    message: formatT(t, 'settingsResetGroupConfirmMessage', { group: t.settingsDsh }),
    confirm,
    cancel,
  };
}
