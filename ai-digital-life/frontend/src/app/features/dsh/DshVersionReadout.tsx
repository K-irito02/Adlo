import { useCallback, useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import type { DshRunningInfo } from '../../../shared/ipc/dsh';
import { dshManageVisible, displayEndpoint, displayUrl } from './dshVersionRuntime';

/** 当前版本读数：主行版本号 + 来源副行 + 徽标 + 最新可用版本。 */
interface VersionReadout {
  text: string;
  sub: string | null;
  empty: boolean;
  /** 运行地址去 token 后的完整地址（悬停提示用）。 */
  title: string | null;
}

/**
 * DSH 组的运行态 / 来源读数（通用版本卡片的 `runtimeReadout` 插槽内容）。
 *
 * 迁移前这段读数长在 `DshVersionManagement` 的「当前版本」行里：任何 effective
 * 都优先显示真实版本号，副行按来源标注运行地址（运行中 · 系统安装 / 外部运行）
 * 或系统安装路径；首屏快照未到、操作在途、拉起中时显示中性骨架。抽出后卡片
 * 自身不感知 DSH 的运行模型。
 */
export function DshVersionReadout({ busy }: { busy: boolean }) {
  const { t } = useTCopy();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const versionStatus = useAppStore((s) => s.versionStatus);
  const snapshotFailed = useAppStore((s) => s.settingsSnapshotFailed);
  const dshRestarting = useAppStore((s) => s.dshRestarting);
  const pendingSource = useAppStore((s) => s.dshVersionSourcePending);

  const versionSource = sourceStatus?.versionSource ?? null;
  const currentSelected = versionStatus?.currentSelected ?? null;
  const latestAvailable = versionStatus?.latestAvailable ?? null;
  const hasUpdate = versionStatus?.hasUpdate ?? false;
  const manageVisible = dshManageVisible(sourceStatus, pendingSource);
  const fastPoll = dshRestarting || sourceStatus?.starting === true;

  const runningReadout = useCallback(
    (running: DshRunningInfo | null | undefined): VersionReadout => {
      const url = running?.url ?? '';
      const endpoint = displayEndpoint(url);
      const title = url ? displayUrl(url) : null;
      const source = running?.source ?? 'external';
      const known = running?.version ?? null;
      const subTemplate = source === 'system' ? t.dshEffectiveRunningSystem : t.dshEffectiveRunning;
      if (known) {
        return {
          text: known,
          sub: subTemplate.replace('{url}', endpoint),
          empty: false,
          title,
        };
      }
      // 版本未知：主行如实报「版本未知」（不把“运行中”当成版本号），
      // 副行按来源说明是外部启动还是系统安装拉起。
      return {
        text: t.dshVersionUnknown,
        sub:
          source === 'external'
            ? t.dshRunningExternalNote.replace('{url}', endpoint)
            : subTemplate.replace('{url}', endpoint),
        empty: true,
        title,
      };
    },
    [t],
  );

  const systemReadout = useCallback(
    (path: string, version: string | null): VersionReadout => {
      if (version) {
        return {
          text: version,
          sub: t.dshEffectiveSystem.replace('{path}', path),
          empty: false,
          title: null,
        };
      }
      return {
        text: t.dshEffectiveSystem.replace('{path}', path),
        sub: t.dshVersionUnknown,
        empty: true,
        title: null,
      };
    },
    [t],
  );

  const readout = useMemo<VersionReadout>(() => {
    // 快照 source 腿未到：如实显示中性「状态读取中」，不拿 currentSelected 顶替
    // 实际来源；快照 source 腿失败且无任何可用数据时切错误态，不再无限骨架。
    if (!versionSource) {
      return {
        text: snapshotFailed ? t.dshVersionStateFailed : t.dshVersionStateReading,
        sub: null,
        empty: true,
        title: null,
      };
    }
    switch (versionSource.effective) {
      case 'host':
        return {
          text: versionSource.hostVersion ?? currentSelected ?? '',
          sub: null,
          empty: false,
          title: null,
        };
      case 'running':
        return runningReadout(sourceStatus?.running);
      case 'system':
        return systemReadout(
          sourceStatus?.system?.path ?? '',
          sourceStatus?.system?.version ?? null,
        );
      default:
        return { text: t.dshCurrentVersionNone, sub: null, empty: true, title: null };
    }
  }, [
    versionSource,
    sourceStatus,
    currentSelected,
    snapshotFailed,
    t,
    runningReadout,
    systemReadout,
  ]);

  // 读数骨架态：首次快照未到、版本操作在途、拉起中/重启长尾时，统一显示中性
  // 骨架胶囊，不展示中途值；快照失败错误态不进骨架（错误文本即最终展示）。
  const readoutLoading = !snapshotFailed && (busy || fastPoll || versionSource === null);
  // 主行版本号确为宿主当前选中才挂更新徽章：system / 外部 running 与宿主选中
  // 不一致时挂徽章会误导。
  const showVersionBadges =
    !readout.empty &&
    (versionSource?.effective === 'host' ||
      versionSource == null ||
      readout.text === currentSelected);

  return (
    <div className="adl-harness-version__readout">
      {readoutLoading ? (
        <span
          className="adl-harness-version__readout-loading"
          role="status"
          aria-label={t.dshVersionStateReading}
        />
      ) : readout.empty ? (
        <span className="adl-harness-version__readout-value is-empty">{readout.text}</span>
      ) : (
        <span className="adl-harness-version__readout-value">
          {readout.text}
          {showVersionBadges ? (
            hasUpdate ? (
              <span className="adl-harness-version__badge adl-harness-version__badge--update">
                {t.harnessVersionHasUpdate}
              </span>
            ) : latestAvailable ? (
              <span className="adl-harness-version__badge">{t.harnessVersionNoUpdate}</span>
            ) : null
          ) : null}
        </span>
      )}
      {!readoutLoading && readout.sub ? (
        // 完整运行地址（已剥离一次性 token query）只在悬停提示里展示。
        <small className="adl-harness-version__readout-sub" title={readout.title ?? undefined}>
          {readout.sub}
        </small>
      ) : null}
      {manageVisible && latestAvailable ? (
        <small className="adl-harness-version__readout-sub">
          {formatT(t, 'dshLatest', { version: latestAvailable })}
        </small>
      ) : null}
    </div>
  );
}
