import { useEffect, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import { getCachedEnvStatus } from '../environment/envStatusCache';
import { peekOpencodeSource } from '../opencode/opencodeVersionBridge';
import type { EnvDependencyState } from '../../../shared/ipc/env';
import type { OpencodeSourceStatus } from '../../../shared/ipc/opencode';
import type { StorageCategoryStatus } from '@shared/ipc/storage';
import { anchorFor } from '@components/settings/settingsSearchIndex';

/** 拼接展示路径：沿用基准路径的分隔符，去重首尾分隔符。 */
function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/**
 * 「外部工具路径」独立块（方案 B，事项 3/3b）：
 * DSH 与环境组各工具的真实实际路径只读索引，位于数据位置索引之后。
 * 只读 + 前往管理跳转，不在此迁移；缺失时 fail-open 显示未知，不禁用、不报错。
 *
 * 口径审计（事项 3b）：后端 `webview2_state` 只记版本不记路径
 * （见 `crates/adl-env/src/providers/webview2.rs:111`），`bash`/`adlserver` 亦仅有存在性信号。故展示口径与环境组同源：
 * 有路径显示路径 → 无路径但有版本显示版本 → 有效但无版本显示“已检测” → 无效显示未知。
 * （环境组 `EnvDepRow renderStatusLine` 的 VERSIONLESS 分支即此语义。）
 */
export function ToolPathsBlock({ categories }: { categories: StorageCategoryStatus[] }) {
  const { t } = useTCopy();
  const actions = useAppActions();
  const envStatus = useAppStore((s) => s.envStatus) ?? getCachedEnvStatus();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const [opencodeSource, setOpencodeSource] = useState<OpencodeSourceStatus | null>(() =>
    peekOpencodeSource(),
  );

  // 后台静默同步（不碰 envBusy / 错误卡）：从未进过环境/DSH/OpenCode 组时也补齐路径。
  useEffect(() => {
    if (useAppStore.getState().envStatus === null) {
      void actions.fetchEnvStatus(true);
    }
    if (useAppStore.getState().sourceStatus === null) {
      void actions.fetchSourceStatus(true);
    }
  }, [actions]);

  useEffect(() => {
    if (opencodeSource) {
      return;
    }
    const bridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;
    if (!bridge) {
      return;
    }
    let alive = true;
    void bridge
      .getSourceStatus()
      .then((result) => {
        if (alive && result.ok) {
          setOpencodeSource(result.data);
        }
      })
      .catch(() => {
        // 只读索引失败保持 unknown，不影响其它行。
      });
    return () => {
      alive = false;
    };
  }, [opencodeSource]);

  /** 环境依赖展示值：路径 → 版本 → 已检测 → 未知（与环境组同口径）。 */
  const displayFor = (section: EnvDependencyState | null | undefined): string => {
    if (section?.path) {
      return section.path;
    }
    if (section?.installedVersion) {
      return `${t.environmentFieldVersion} ${section.installedVersion}`;
    }
    if (section && section.effective !== 'none') {
      return t.environmentStatusDetected;
    }
    return t.storageToolPathsUnknown;
  };

  const harnessesPath = categories.find((c) => c.key === 'harnesses')?.path ?? null;
  const dshDisplay = (() => {
    if (!sourceStatus) {
      return t.storageToolPathsUnknown;
    }
    if (sourceStatus.versionSource?.effective === 'system' && sourceStatus.system?.path) {
      return sourceStatus.system.path;
    }
    const selected = sourceStatus.versionSource?.hostVersion;
    if (harnessesPath && selected) {
      return joinPath(harnessesPath, 'dsh', 'versions', 'installed', selected);
    }
    if (selected) {
      return sourceStatus.system?.path ?? t.storageToolPathsUnknown;
    }
    if (sourceStatus.versionSource?.effective === 'running') {
      return t.storageToolPathsUnknown;
    }
    return t.storageToolPathsNoVersion;
  })();
  const opencodeDisplay = (() => {
    if (!opencodeSource) {
      return t.storageToolPathsUnknown;
    }
    if (opencodeSource.versionSource?.effective === 'system' && opencodeSource.system?.path) {
      return opencodeSource.system.path;
    }
    const selected = opencodeSource.versionSource?.hostVersion;
    if (harnessesPath && selected) {
      return joinPath(harnessesPath, 'opencode', 'versions', 'installed', selected);
    }
    if (selected) {
      return opencodeSource.system?.path ?? t.storageToolPathsUnknown;
    }
    return t.storageToolPathsNoVersion;
  })();

  const rows: {
    name: string;
    display: string;
    goTo: 'environment' | 'dsh' | 'opencode';
  }[] = [
    { name: t.environmentDepNode, display: displayFor(envStatus?.node), goTo: 'environment' },
    { name: t.environmentDepGit, display: displayFor(envStatus?.git), goTo: 'environment' },
    { name: t.environmentDepBash, display: displayFor(envStatus?.bash), goTo: 'environment' },
    {
      name: t.environmentDepWebview2,
      display: displayFor(envStatus?.webview2),
      goTo: 'environment',
    },
    {
      name: t.environmentDepAdlserver,
      display: displayFor(envStatus?.adlserver),
      goTo: 'environment',
    },
    {
      name: t.settingsDsh,
      display: dshDisplay,
      goTo: 'dsh',
    },
    {
      name: t.settingsOpencode,
      display: opencodeDisplay,
      goTo: 'opencode',
    },
  ];

  return (
    <>
      <div
        className="adl-settings-storage__header adl-settings-storage__header--section"
        data-testid="tool-paths-block-header"
        data-settings-anchor={anchorFor('storage', 'toolPaths')}
      >
        <SettingsHintButton content={t.storageToolPathsHint} />
        <SettingsHeader title={t.storageToolPathsTitle} />
      </div>
      <div className="adl-settings-card" data-testid="tool-paths-card">
        {rows.map((row) => (
          <div
            className="adl-settings-row adl-settings-row--center"
            key={row.name}
            data-settings-row={row.name}
            data-testid="tool-paths-item"
          >
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{row.name}</span>
              </div>
              <small>{row.display}</small>
            </div>
            <div className="adl-settings-row__control adl-settings-row__control--inline">
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                onClick={() => setActiveSettingsGroup(row.goTo)}
              >
                {t.storageToolPathsGoTo}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
