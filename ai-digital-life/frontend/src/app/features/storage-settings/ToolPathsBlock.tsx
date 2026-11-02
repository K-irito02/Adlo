import { useEffect, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyDict } from '@i18n';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import { getCachedEnvStatus } from '../environment/envStatusCache';
import { peekOpencodeSource } from '../opencode/opencodeVersionBridge';
import type { EnvDependencyState } from '../../../shared/ipc/env';
import type {
  DshEffectiveSource,
  DshRunningSource,
  DshSourceStatus,
} from '../../../shared/ipc/dsh';
import type { OpencodeSourceStatus } from '../../../shared/ipc/opencode';
import type { StorageCategoryStatus } from '@shared/ipc/storage';
import { anchorFor } from '@components/settings/settingsSearchIndex';

/** 拼接展示路径：沿用基准路径的分隔符，去重首尾分隔符。 */
function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/** 版本来源的统一视图：DSH 额外有运行态（外部进程 / 宿主拉起），OpenCode 没有。 */
interface HarnessPathSource {
  effective: DshEffectiveSource;
  hostVersion: string | null;
  systemPath: string | null;
  runningSource?: DshRunningSource | null;
  runningVersion?: string | null;
}

function toPathSource(source: DshSourceStatus | OpencodeSourceStatus): HarnessPathSource | null {
  // IPC 类型里 `versionSource` 必填；这里仍做一次运行时守卫：畸形/半初始化快照
  // 应显示「未知」，不能把它误判成「未使用任何版本」。
  const versionSource = source.versionSource as DshSourceStatus['versionSource'] | undefined;
  if (!versionSource) {
    return null;
  }
  return {
    effective: versionSource.effective,
    hostVersion: versionSource.hostVersion,
    systemPath: source.system?.path ?? null,
    runningSource: 'running' in source ? (source.running?.source ?? null) : null,
    runningVersion: 'running' in source ? (source.running?.version ?? null) : null,
  };
}

/**
 * 当前实际使用路径：按 `effective` 分支（与版本读数卡同口径），而不是「哪个字段有值用哪个」。
 *
 * - system：系统安装生效 → 系统路径；路径未知 → 未知。
 * - running：DSH 运行中，只有宿主拉起的进程能对应到托管版本；外部进程 → 未知。
 * - host：当前托管版本目录 `installed/<version>`；没有选中版本 → 「未使用任何版本」。
 * - none：没有可用来源 → 「未使用任何版本」。
 *
 * 任何情况下都不把版本库根目录当作「当前使用路径」。
 */
function displayForHarness(
  source: HarnessPathSource | null,
  tool: 'dsh' | 'opencode',
  harnessesPath: string | null,
  t: CopyDict,
): string {
  if (!source) {
    return t.storageToolPathsUnknown;
  }
  switch (source.effective) {
    case 'system':
      return source.systemPath || t.storageToolPathsUnknown;
    case 'running':
      if (source.runningSource === 'system') {
        return source.systemPath || t.storageToolPathsUnknown;
      }
      if (source.runningSource !== 'host') {
        return t.storageToolPathsUnknown;
      }
      // 宿主拉起的运行中实例：以它实际运行的版本为准（可能与当前选中版本不同）。
      if (!source.runningVersion) {
        return t.storageToolPathsUnknown;
      }
      if (!harnessesPath) {
        return t.storageToolPathsUnknown;
      }
      return joinPath(harnessesPath, tool, 'versions', 'installed', source.runningVersion);
    case 'host':
      break;
    default:
      return t.storageToolPathsNoVersion;
  }
  if (!source.hostVersion) {
    return t.storageToolPathsNoVersion;
  }
  if (!harnessesPath) {
    return t.storageToolPathsUnknown;
  }
  return joinPath(harnessesPath, tool, 'versions', 'installed', source.hostVersion);
}

/**
 * 「外部工具路径」独立块（方案 B，事项 3/3b）：
 * DSH / OpenCode CLI 与环境组各工具的真实实际路径只读索引，位于数据位置索引之后。
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
  const dshDisplay = displayForHarness(
    sourceStatus ? toPathSource(sourceStatus) : null,
    'dsh',
    harnessesPath,
    t,
  );
  const opencodeDisplay = displayForHarness(
    opencodeSource ? toPathSource(opencodeSource) : null,
    'opencode',
    harnessesPath,
    t,
  );

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
