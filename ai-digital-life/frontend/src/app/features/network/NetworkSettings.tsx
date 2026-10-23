import { useEffect } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { SettingsHeader } from '@components/settings/SettingsHeader';
import { anchorFor } from '@components/settings/settingsSearchIndex';

/**
 * 「网络」设置组空壳（Task 4 注册与接线；Task 5 填充源/代理/测试三块）。
 *
 * 三锚点（source/proxy/test）与搜索索引同源，块标题复用 dsh 域旧 key
 * （Task 3 Ruling：key 只是标识符，不迁移领域）。
 * pending 消费照抄 DshSettings 挂载行为：开框即清 + 卸载兜底，避免侧边栏
 * pending 悬空（环境不进 ResetAll 自动序列，网络进，故此处只消费不清聚合——
 * 本组暂无聚合信号，Task 5 拆分 `dshBlocksAtDefault` 时再补）。
 */
export function NetworkSettings() {
  const { t } = useTCopy();
  const networkGroupResetPending = useAppStore((s) => s.networkGroupResetPending);
  const consumeNetworkGroupReset = useAppStore((s) => s.consumeNetworkGroupReset);

  useEffect(() => {
    if (networkGroupResetPending) {
      consumeNetworkGroupReset();
    }
    return () => {
      useAppStore.getState().consumeNetworkGroupReset();
    };
  }, [networkGroupResetPending, consumeNetworkGroupReset]);

  return (
    <div className="adl-settings-section adl-network-settings">
      <SettingsHeader title={t.settingsNetwork} description={t.networkDesc} />
      <div data-settings-anchor={anchorFor('network', 'source')}>
        <SettingsHeader title={t.dshSettingsSource} />
        <div className="adl-settings-card" />
      </div>
      <div data-settings-anchor={anchorFor('network', 'proxy')}>
        <SettingsHeader title={t.dshSettingsProxy} />
        <div className="adl-settings-card" />
      </div>
      <div data-settings-anchor={anchorFor('network', 'test')}>
        <SettingsHeader title={t.dshSettingsTestConnection} />
        <div className="adl-settings-card" />
      </div>
    </div>
  );
}
