import type { ReactNode } from 'react';
import { IconCpu, IconMemory, IconDatabase, IconGlobe, IconList, IconHistory } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { formatBytes } from '@root/design-system/html';
import { EmptyRow } from '@components/LoadingRow';
import type { SystemSnapshot } from '@shared/ipc/system_monitor';

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
  cpuPerCore: number[];
}

function CpuSection({ cpuTotal, cpuPerCore }: CpuSectionProps) {
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
      {cpuPerCore.length > 0 ? (
        <div className="adl-sysmon__cores">
          {cpuPerCore.map((core, idx) => {
            const corePct = clampPercent(core);
            return (
              <div className="adl-sysmon__core" key={idx} title={`${t.sysCpu} ${idx}`}>
                <div className="adl-sysmon-bar">
                  <div className="adl-sysmon-bar__fill" style={{ width: `${corePct}%` }} />
                </div>
                <span className="adl-sysmon__core-idx">{idx}</span>
              </div>
            );
          })}
        </div>
      ) : null}
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
      <div className="adl-sysmon__row">
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
        <table className="adl-sysmon__table">
          <thead>
            <tr>
              <th>{t.sysDiskMount}</th>
              <th>{t.sysDiskUsed}</th>
              <th>{t.sysDiskAvail}</th>
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
        <table className="adl-sysmon__table">
          <thead>
            <tr>
              <th>{''}</th>
              <th>{t.sysNetUp}</th>
              <th>{t.sysNetDown}</th>
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
  const { t } = useTCopy();
  return (
    <section className="adl-sysmon__section">
      <SectionTitle icon={<IconList size={12} decorative />} label={t.sysProcessTopN} />
      {processes.length === 0 ? (
        <EmptyRow message={t.sysEmpty} variant="center" />
      ) : (
        <table className="adl-sysmon__table">
          <thead>
            <tr>
              <th>{t.sysProcName}</th>
              <th>{t.sysProcPid}</th>
              <th>{t.sysProcCpu}</th>
              <th>{t.sysProcMem}</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((proc) => (
              <tr key={proc.pid}>
                <td className="adl-sysmon__name">{proc.name}</td>
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
 * 系统监控展开详情：CPU（总 + 每核心）、内存、磁盘、网络、进程 Top-N、开机时长。
 */
export function SysmonDetails() {
  const { t } = useTCopy();
  const sysmonSnapshot = useAppStore((s) => s.sysmonSnapshot);
  if (!sysmonSnapshot) {
    return (
      <div className="adl-sysmon__body">
        <EmptyRow message={t.sysEmpty} variant="center" />
      </div>
    );
  }

  return (
    <div className="adl-sysmon__body">
      <CpuSection cpuTotal={sysmonSnapshot.cpuTotal} cpuPerCore={sysmonSnapshot.cpuPerCore} />
      <MemorySection
        memoryUsed={sysmonSnapshot.memoryUsed}
        memoryTotal={sysmonSnapshot.memoryTotal}
      />
      <DisksSection disks={sysmonSnapshot.disks} />
      <NetworkSection networks={sysmonSnapshot.networks} />
      <ProcessSection processes={sysmonSnapshot.processes} />
      <UptimeSection uptimeSecs={sysmonSnapshot.uptimeSecs} />
    </div>
  );
}
