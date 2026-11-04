import { useEffect } from 'react';
import { IconMonitor, IconChevronDown, IconChevronUp } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { CpuMemoryMini } from './CpuMemoryMini';
import { SysmonDetails } from './SysmonDetails';

const EXPANDED_REFRESH_INTERVAL_MS = 1000;
const COLLAPSED_REFRESH_INTERVAL_MS = 2000;

/**
 * 系统监控可折叠面板（置于左侧边栏底部）。
 * - 默认折叠：仅渲染 CpuMemoryMini 迷你卡片
 * - 展开时：渲染完整 SysmonDetails，并以 1s 间隔轮询 fetchSystemSnapshot
 * - 折叠态也低频轮询（2s），保证迷你卡片的 CPU/内存数据持续刷新而非恒 0%
 */
export function SystemMonitorPanel() {
  const { t } = useTCopy();
  const collapsed = useAppStore((s) => s.sysmonCollapsed);
  const toggleSysmonCollapsed = useAppStore((s) => s.toggleSysmonCollapsed);
  const fetchSystemSnapshot = useAppStore((s) => s.fetchSystemSnapshot);

  useEffect(() => {
    const interval = collapsed ? COLLAPSED_REFRESH_INTERVAL_MS : EXPANDED_REFRESH_INTERVAL_MS;
    void fetchSystemSnapshot();
    const id = window.setInterval(() => {
      void fetchSystemSnapshot();
    }, interval);
    return () => window.clearInterval(id);
  }, [collapsed, fetchSystemSnapshot]);

  return (
    <section className="adl-sysmon" aria-label={t.systemMonitor}>
      <button
        type="button"
        className="adl-sysmon__header"
        onClick={toggleSysmonCollapsed}
        aria-expanded={!collapsed}
      >
        <span className="adl-sysmon__icon" aria-hidden="true">
          <IconMonitor size={14} decorative />
        </span>
        <span className="adl-section-toolbar__label">{t.systemMonitor}</span>
        {collapsed ? (
          <IconChevronUp className="adl-sysmon__chevron" size={14} decorative />
        ) : (
          <IconChevronDown className="adl-sysmon__chevron" size={14} decorative />
        )}
      </button>
      {collapsed ? <CpuMemoryMini /> : <SysmonDetails />}
    </section>
  );
}
