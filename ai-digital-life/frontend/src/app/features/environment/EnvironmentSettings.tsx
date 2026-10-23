import { useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { SettingsHeader } from '@components/settings/SettingsHeader';
import { anchorFor } from '@components/settings/settingsSearchIndex';

/**
 * 「环境」设置组空壳（Task 4 注册与接线；Task 7 填充七依赖行）。
 *
 * 单锚点（deps）与搜索索引同源；七个操作行（安装/切换/卸载/重装/重测/
 * 复制/前往配置）已按索引登记、属条件行（Task 7 渲染时带同名
 * `data-settings-row` 标记），空壳期卡内无行。
 * pending 消费照抄 DshSettings 挂载行为：开框即清 + 卸载兜底，避免侧边栏
 * pending 悬空。环境不进 ResetAll 自动序列：其组级重置仅侧边栏自助，
 * 故本组无 ResetAll 腿、无聚合信号。
 */
export function EnvironmentSettings() {
  const { t } = useTCopy();
  const environmentGroupResetPending = useAppStore((s) => s.environmentGroupResetPending);
  const consumeEnvironmentGroupReset = useAppStore((s) => s.consumeEnvironmentGroupReset);

  useEffect(() => {
    if (environmentGroupResetPending) {
      consumeEnvironmentGroupReset();
    }
    return () => {
      useAppStore.getState().consumeEnvironmentGroupReset();
    };
  }, [environmentGroupResetPending, consumeEnvironmentGroupReset]);

  return (
    <div className="adl-settings-section adl-environment-settings">
      <SettingsHeader title={t.settingsEnvironment} description={t.environmentDesc} />
      <div data-settings-anchor={anchorFor('environment', 'deps')}>
        <div className="adl-settings-card" />
      </div>
    </div>
  );
}
