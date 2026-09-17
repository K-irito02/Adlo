import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { IconCpu, IconMemory, IconDatabase, IconGlobe, IconList, IconHistory } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { formatBytes } from '@root/design-system/html';
import { EmptyRow } from '@components/LoadingRow';
import { CopyButton } from '@components/CopyButton';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { usePersistedScrollTop } from '@hooks/usePersistedScrollTop';
import type { SystemSnapshot } from '@shared/ipc/system_monitor';

const SYSMON_SCROLL_TOP_KEY = 'adl-ui:sysmon-scroll-top';

type DiskStat = SystemSnapshot['disks'][number];
type NetStat = SystemSnapshot['networks'][number];
type ProcessStat = SystemSnapshot['processes'][number];

/** 开机时长格式化为 "h m" 形式。 */
function formatUptime(uptimeSecs: number): string {
  const secs = Math.max(0, uptimeSecs);
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/** 百分比归一化到 [0, 100]。 */
function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(100, value);
}

interface SectionTitleProps {
  icon: ReactNode;
  label: string;
}

function SectionTitle({ icon, label }: SectionTitleProps) {
  return (
    <div className="adl-sysmon__section-title">
      <span className="adl-sysmon__icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

interface CpuSectionProps {
  cpuTotal: number;
}

function CpuSection({ cpuTotal }: CpuSectionProps) {
  const { t } = useTCopy();
  const totalPct = clampPercent(cpuTotal);
  return (
    <section className="adl-sysmon__section">
      <SectionTitle icon={<IconCpu size={12} decorative />} label={t.sysCpu} />
      <div className="adl-sysmon__row">
        <span className="adl-sysmon__row-label">{t.sysCpu}</span>
        <div className="adl-sysmon-bar">
          <div className="adl-sysmon-bar__fill" style={{ width: `${totalPct}%` }} />
        </div>
        <span className="adl-sysmon__value">{totalPct.toFixed(0)}%</span>
      </div>
    </section>
  );
}

interface MemorySectionProps {
  memoryUsed: number;
  memoryTotal: number;
}

function MemorySection({ memoryUsed, memoryTotal }: MemorySectionProps) {
  const { t } = useTCopy();
  const usedPct = clampPercent((memoryUsed / memoryTotal) * 100);
  return (
    <section className="adl-sysmon__section">
      <SectionTitle icon={<IconMemory size={12} decorative />} label={t.sysMemory} />
      <div className="adl-sysmon__row adl-sysmon__row--memory">
        <span className="adl-sysmon__row-label">
          {formatBytes(memoryUsed)} / {formatBytes(memoryTotal)}
        </span>
        <div className="adl-sysmon-bar">
          <div className="adl-sysmon-bar__fill" style={{ width: `${usedPct}%` }} />
        </div>
        <span className="adl-sysmon__value">{usedPct.toFixed(0)}%</span>
      </div>
    </section>
  );
}

interface DisksSectionProps {
  disks: DiskStat[];
}

function DisksSection({ disks }: DisksSectionProps) {
  const { t } = useTCopy();
  return (
    <section className="adl-sysmon__section">
      <SectionTitle icon={<IconDatabase size={12} decorative />} label={t.sysDisks} />
      {disks.length === 0 ? (
        <EmptyRow message={t.sysEmpty} variant="center" />
      ) : (
        <table className="adl-sysmon__table adl-sysmon__table--disks">
          <thead>
            <tr>
              <th scope="col">{t.sysDiskMount}</th>
              <th scope="col">{t.sysDiskUsed}</th>
              <th scope="col">{t.sysDiskAvail}</th>
            </tr>
          </thead>
          <tbody>
            {disks.map((disk, idx) => (
              <tr key={`${disk.mount}-${idx}`}>
                <td className="adl-sysmon__name">{disk.mount}</td>
                <td>{formatBytes(disk.total - disk.available)}</td>
                <td>{formatBytes(disk.available)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface NetworkSectionProps {
  networks: NetStat[];
}

function NetworkSection({ networks }: NetworkSectionProps) {
  const { t } = useTCopy();
  return (
    <section className="adl-sysmon__section">
      <SectionTitle icon={<IconGlobe size={12} decorative />} label={t.sysNetwork} />
      {networks.length === 0 ? (
        <EmptyRow message={t.sysEmpty} variant="center" />
      ) : (
        <table className="adl-sysmon__table adl-sysmon__table--nets">
          <thead>
            <tr>
              <th scope="col" aria-label={t.sysNetwork}>
                {''}
              </th>
              <th scope="col">{t.sysNetUp}</th>
              <th scope="col">{t.sysNetDown}</th>
            </tr>
          </thead>
          <tbody>
            {networks.map((net, idx) => (
              <tr key={`${net.name}-${idx}`}>
                <td className="adl-sysmon__name">{net.name}</td>
                <td>↑ {formatBytes(net.txBps)}/s</td>
                <td>↓ {formatBytes(net.rxBps)}/s</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface ProcessSectionProps {
  processes: ProcessStat[];
}

function ProcessSection({ processes }: ProcessSectionProps) {
  const { t, formatT } = useTCopy();
  return (
    <section className="adl-sysmon__section">
      <SectionTitle icon={<IconList size={12} decorative />} label={t.sysProcessTopN} />
      {processes.length === 0 ? (
        <EmptyRow message={t.sysEmpty} variant="center" />
      ) : (
        <table className="adl-sysmon__table adl-sysmon__table--procs">
          <thead>
            <tr>
              <th scope="col">{t.sysProcName}</th>
              <th scope="col" className="adl-sysmon__actions-col" aria-label={t.copy} />
              <th scope="col">{t.sysProcPid}</th>
              <th scope="col">{t.sysProcCpu}</th>
              <th scope="col">{t.sysProcMem}</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((proc) => (
              <tr key={proc.pid}>
                <td className="adl-sysmon__name">{proc.name}</td>
                <td className="adl-sysmon__actions-col">
                  <CopyButton
                    size={12}
                    className="adl-sysmon__copy"
                    text={formatT(t, 'sysProcCopyText', { name: proc.name, pid: proc.pid })}
                    tooltip={t.copy}
                    tooltipCopied={t.copySuccessClipboard}
                    nativeTooltip
                  />
                </td>
                <td>{proc.pid}</td>
                <td>{proc.cpuUsage.toFixed(1)}%</td>
                <td>{formatBytes(proc.memory)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface UptimeSectionProps {
  uptimeSecs: number;
}

function UptimeSection({ uptimeSecs }: UptimeSectionProps) {
  const { t } = useTCopy();
  return (
    <div className="adl-sysmon__uptime">
      <span className="adl-sysmon__icon" aria-hidden="true">
        <IconHistory size={12} decorative />
      </span>
      <span>
        {t.sysUptime}: {formatUptime(uptimeSecs)}
      </span>
    </div>
  );
}

/**
 * 系统监控展开详情：CPU（总量）、内存、磁盘、网络、进程 Top-N、开机时长。
 */
export function SysmonDetails() {
  const { t } = useTCopy();
  const sysmonSnapshot = useAppStore((s) => s.sysmonSnapshot);
  const { scrollRef: sysmonScrollRef, tryRestore: tryRestoreSysmonScroll } =
    usePersistedScrollTop(SYSMON_SCROLL_TOP_KEY);

  // 快照异步到达：数据就绪后回填上次滚动位置（用户手动滚动后不再回填）。
  useEffect(() => {
    if (sysmonSnapshot) {
      tryRestoreSysmonScroll();
    }
  }, [sysmonSnapshot, tryRestoreSysmonScroll]);

  if (!sysmonSnapshot) {
    return (
      <div className="adl-sysmon__body">
        <EmptyRow message={t.sysEmpty} variant="center" />
      </div>
    );
  }

  return (
    <CustomScrollArea
      ref={sysmonScrollRef}
      shellClassName="adl-sysmon__body adl-sysmon__scroll-shell"
      scrollClassName="adl-sysmon-scroll"
      scrollbarClassName="adl-sysmon-scrollbar"
      thumbClassName="adl-sysmon-scrollbar__thumb"
    >
      <div className="adl-sysmon__body-inner">
        <CpuSection cpuTotal={sysmonSnapshot.cpuTotal} />
        <MemorySection
          memoryUsed={sysmonSnapshot.memoryUsed}
          memoryTotal={sysmonSnapshot.memoryTotal}
        />
        <DisksSection disks={sysmonSnapshot.disks} />
        <NetworkSection networks={sysmonSnapshot.networks} />
        <ProcessSection processes={sysmonSnapshot.processes} />
        <UptimeSection uptimeSecs={sysmonSnapshot.uptimeSecs} />
      </div>
    </CustomScrollArea>
  );
}
