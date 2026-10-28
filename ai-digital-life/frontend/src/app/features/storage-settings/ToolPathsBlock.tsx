import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import { getCachedEnvStatus } from '../environment/envStatusCache';
import type { EnvDependencyState } from '../../../shared/ipc/env';
import type { StorageCategoryStatus } from '@shared/ipc/storage';
import { anchorFor } from '@components/settings/settingsSearchIndex';

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

  // 后台静默同步（不碰 envBusy / 错误卡）：从未进过环境/DSH 组时也补齐路径。
  useEffect(() => {
    if (useAppStore.getState().envStatus === null) {
      void actions.fetchEnvStatus(true);
    }
    if (useAppStore.getState().sourceStatus === null) {
      void actions.fetchSourceStatus(true);
    }
  }, [actions]);

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

  const dshStoragePath = categories.find((c) => c.key === 'harnesses')?.path ?? null;

  const rows: { name: string; display: string; goTo: 'environment' | 'dsh' }[] = [
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
      display: sourceStatus?.system?.path ?? dshStoragePath ?? t.storageToolPathsUnknown,
      goTo: 'dsh',
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
            className="adl-settings-row"
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
