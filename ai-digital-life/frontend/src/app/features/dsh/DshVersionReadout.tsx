import { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import type { DshRunningInfo } from '../../../shared/ipc/dsh';

/** 当前版本读数：只承载版本号（或未安装 / 版本未知等占位文案）。 */
interface VersionReadout {
  text: string;
  empty: boolean;
}

/**
 * DSH 组的运行态 / 来源读数（通用版本卡片的 `runtimeReadout` 插槽内容）。
 *
 * 读数容器由卡片提供（当前版本行内单个 `__readout`），本组件只渲染一个值：
 * 真实版本号，或未安装 / 版本未知 / 读取中的占位文案。
 *
 * 刻意**不**在这里显示更新结论（有新版本可用 / 已是最新 / 最新版本号）与运行地址：
 * 更新信息归「检查更新」行，来源（宿主托管 / 系统安装 / 运行中）归「版本来源」行，
 * 当前版本行只回答「现在用的是什么版本」。
 */
export function DshVersionReadout({ busy }: { busy: boolean }) {
  const { t } = useTCopy();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const versionStatus = useAppStore((s) => s.versionStatus);
  const snapshotFailed = useAppStore((s) => s.settingsSnapshotFailed);
  const dshRestarting = useAppStore((s) => s.dshRestarting);

  const versionSource = sourceStatus?.versionSource ?? null;
  const currentSelected = versionStatus?.currentSelected ?? null;
  const fastPoll = dshRestarting || sourceStatus?.starting === true;

  /** 运行中实例：有版本号就报版本号，否则如实报「版本未知」。 */
  const runningReadout = useCallback(
    (running: DshRunningInfo | null | undefined): VersionReadout => {
      const known = running?.version ?? null;
      return known ? { text: known, empty: false } : { text: t.dshVersionUnknown, empty: true };
    },
    [t],
  );

  const readout = useMemo<VersionReadout>(() => {
    // 快照 source 腿未到：如实显示中性「状态读取中」，不拿 currentSelected 顶替
    // 实际来源；快照 source 腿失败且无任何可用数据时切错误态，不再无限骨架。
    if (!versionSource) {
      return {
        text: snapshotFailed ? t.dshVersionStateFailed : t.dshVersionStateReading,
        empty: true,
      };
    }
    switch (versionSource.effective) {
      case 'host': {
        // 宿主托管：优先宿主已装版本号，其次选中版本；两者都没有就是未安装。
        const hostVersion = versionSource.hostVersion ?? currentSelected ?? '';
        return hostVersion
          ? { text: hostVersion, empty: false }
          : { text: t.dshCurrentVersionNone, empty: true };
      }
      case 'running':
        return runningReadout(sourceStatus?.running);
      case 'system': {
        const systemVersion = sourceStatus?.system?.version ?? null;
        return systemVersion
          ? { text: systemVersion, empty: false }
          : { text: t.dshVersionUnknown, empty: true };
      }
      default:
        return { text: t.dshCurrentVersionNone, empty: true };
    }
  }, [versionSource, sourceStatus, currentSelected, snapshotFailed, t, runningReadout]);

  // 读数骨架态：首次快照未到、版本操作在途、拉起中/重启长尾时，统一显示中性
  // 骨架胶囊，不展示中途值；快照失败错误态不进骨架（错误文本即最终展示）。
  const readoutLoading = !snapshotFailed && (busy || fastPoll || versionSource === null);

  if (readoutLoading) {
    return (
      <span
        className="adl-harness-version__readout-loading"
        role="status"
        aria-label={t.dshVersionStateReading}
      />
    );
  }

  return (
    <span className={`adl-harness-version__readout-value${readout.empty ? ' is-empty' : ''}`}>
      {readout.text}
    </span>
  );
}
