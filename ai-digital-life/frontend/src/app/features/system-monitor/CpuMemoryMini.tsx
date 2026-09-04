import type { ReactNode } from 'react';
import { IconCpu, IconMemory } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';

/** 百分比上限，避免超 100% 导致进度条溢出。 */
function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(100, value);
}

interface MiniRowProps {
  icon: ReactNode;
  label: string;
  percent: number;
}

function MiniRow({ icon, label, percent }: MiniRowProps) {
  const width = clampPercent(percent);
  return (
    <div className="adl-sysmon-mini__row">
      <span className="adl-sysmon-mini__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="adl-sysmon-mini__label">{label}</span>
      <div className="adl-sysmon-bar">
        <div className="adl-sysmon-bar__fill" style={{ width: `${width}%` }} />
      </div>
      <span className="adl-sysmon-mini__value">{width.toFixed(0)}%</span>
    </div>
  );
}

/**
 * 折叠态迷你卡：CPU + 内存两条迷你进度条。
 * 无快照时按 0% 渲染（不展示空态文本）。
 */
export function CpuMemoryMini() {
  const { t } = useTCopy();
  const sysmonSnapshot = useAppStore((s) => s.sysmonSnapshot);

  const memPercent = sysmonSnapshot
    ? (sysmonSnapshot.memoryUsed / sysmonSnapshot.memoryTotal) * 100
    : 0;

  return (
    <div className="adl-sysmon-mini" aria-label={t.systemMonitor}>
      <MiniRow
        icon={<IconCpu size={12} decorative />}
        label={t.sysCpu}
        percent={sysmonSnapshot?.cpuTotal ?? 0}
      />
      <MiniRow
        icon={<IconMemory size={12} decorative />}
        label={t.sysMemory}
        percent={memPercent}
      />
    </div>
  );
}
