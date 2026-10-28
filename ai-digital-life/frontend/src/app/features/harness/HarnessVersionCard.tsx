import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyDict } from '@i18n/types';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import type {
  HarnessVersionBridge,
  HarnessVersionMutation,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionSourceMode,
  HarnessVersionSourceStatus,
  HarnessVersionTask,
  HarnessVersionTone,
} from './harnessVersionBridge';

export interface HarnessVersionSlotContext<TSource> {
  /** 有任一版本操作进行中。 */
  busy: boolean;
  /** `busy` 或底层桥不可用；插槽内控件应使用它控制 disabled。 */
  disabled: boolean;
  source: HarnessVersionSourceStatus | null;
  /** 工具专属来源数据（适配器提供）。 */
  sourceExtra: TSource | null;
  /** 走卡片的忙碌/反馈/刷新流程执行一个工具专属操作。 */
  run: (
    action: () => Promise<HarnessVersionResult>,
    successMessage: string | null,
  ) => Promise<void>;
  notify: (message: string, tone: HarnessVersionTone) => void;
}

export type HarnessVersionSlot<TSource> =
  | ReactNode
  | ((context: HarnessVersionSlotContext<TSource>) => ReactNode);

export interface HarnessVersionSlots<TSource> {
  /** 宿主已自行渲染块头（标题 + 提示）时置 true，卡片不再重复渲染一块头。 */
  hideHeader?: boolean;
  /** 标题旁「?」提示内容；缺省使用通用说明。 */
  headerHint?: string;
  /** 版本来源行「?」提示内容；缺省使用通用说明。 */
  sourceHint?: string;
  /** 未安装引导横幅；缺省使用带 `{tool}` 插值的通用文案。 */
  missingBanner?: HarnessVersionSlot<TSource>;
  /** 来源卡片内的说明行（工具专属来源解释）。 */
  sourceNote?: HarnessVersionSlot<TSource>;
  /** 来源卡片尾部的工具内容（如 OpenCode 的终端可用性开关）。 */
  sourceFooter?: HarnessVersionSlot<TSource>;
  /** 当前版本读数旁的运行态内容（DSH 的运行地址/系统安装读数）。 */
  runtimeReadout?: HarnessVersionSlot<TSource>;
  /** 卡片尾部内容。 */
  footer?: HarnessVersionSlot<TSource>;
}

export interface HarnessVersionCardProps<TSource = unknown> {
  bridge: HarnessVersionBridge<TSource>;
  slots?: HarnessVersionSlots<TSource>;
}

function renderSlot<TSource>(
  slot: HarnessVersionSlot<TSource> | undefined,
  context: HarnessVersionSlotContext<TSource>,
): ReactNode {
  if (typeof slot === 'function') {
    return slot(context);
  }
  return slot ?? null;
}

function phaseLabel(task: HarnessVersionTask, t: CopyDict): string {
  switch (task.phase) {
    case 'preparing':
      return t.harnessVersionPhasePreparing;
    case 'installing':
      // 总量未知 = npm 还在下载（tmp 尚空），如实显示「下载中」而不是假装在装。
      return task.total > 0 ? t.harnessVersionPhaseInstalling : t.harnessVersionPhaseDownloading;
    case 'removing':
      // 空目录视为准备中（与迁移前 DSH 任务行同口径）。
      return task.total > 0 ? t.harnessVersionPhaseRemoving : t.harnessVersionPhasePreparing;
    default:
      return t.harnessVersionPhaseFinalizing;
  }
}

/** 发布时间 `YYYY-MM-DD HH:mm`（与迁移前 DSH 通道行同一格式）。 */
function formatPublishedAt(rfc3339: string | null): string {
  if (!rfc3339) {
    return '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(rfc3339);
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}` : rfc3339;
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const MENU_GAP = 6;
const MENU_MARGIN = 8;
const MENU_MIN_HEIGHT = 120;

type ChannelKey = 'stable' | 'prerelease';

/** 行内选择器的生效版本：用户选择 → 当前版本 → 通道最新。 */
function pickEffective<T extends { version: string }>(
  infos: T[],
  pick: string | null,
  followed: string | null,
): string | null {
  if (pick && infos.some((info) => info.version === pick)) {
    return pick;
  }
  if (followed && infos.some((info) => info.version === followed)) {
    return followed;
  }
  return infos[0]?.version ?? null;
}

/**
 * 通用 harness 版本卡片：安装/更新/切换/卸载/重装、稳定与预发布通道、
 * 手动版本号、来源三态、任务进度与取消。
 *
 * 卡片只依赖 {@link HarnessVersionBridge} 与可选插槽，不读取任何 store，
 * 也不访问 `window.digitalLife`。
 */
export function HarnessVersionCard<TSource = unknown>({
  bridge,
  slots = {},
}: HarnessVersionCardProps<TSource>) {
  const { t, formatT } = useTCopy();
  const [snapshot, setSnapshot] = useState<HarnessVersionSnapshot<TSource> | null>(null);
  const [task, setTask] = useState<HarnessVersionTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [stablePick, setStablePick] = useState('');
  const [manual, setManual] = useState('');
  const [uninstallArmed, setUninstallArmed] = useState<string | null>(null);
  // 双通道行内选择器（`capabilities.channelPicker`）：null = 自动跟随当前/通道最新。
  const [stableChoice, setStableChoice] = useState<string | null>(null);
  const [prereleaseChoice, setPrereleaseChoice] = useState<string | null>(null);
  const [openChannel, setOpenChannel] = useState<ChannelKey | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  const applySnapshot = useCallback((next: HarnessVersionSnapshot<TSource>) => {
    setSnapshot((previous) => ({
      // 腿级降级：某一路读取失败时保留上一次的值（与迁移前 OpenCode 行为一致）。
      status: next.status ?? previous?.status ?? null,
      catalog: next.catalog ?? previous?.catalog ?? null,
      source: next.source ?? previous?.source ?? null,
      sourceExtra: next.sourceExtra ?? previous?.sourceExtra ?? null,
      failed: next.failed === true && next.status === null && (previous?.status ?? null) === null,
      catalogFailed: next.catalogFailed === true,
    }));
    if (next.status) {
      setStablePick(
        (prev) => prev || next.status?.currentSelected || next.status?.latestAvailable || '',
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await bridge.load();
      applySnapshot(next);
    } catch {
      applySnapshot({
        status: null,
        catalog: null,
        source: null,
        sourceExtra: null,
        failed: true,
      });
    }
  }, [applySnapshot, bridge]);

  useEffect(() => {
    let alive = true;
    void bridge
      .load()
      .then((next) => {
        if (alive) {
          applySnapshot(next);
        }
      })
      .catch(() => {
        if (alive) {
          applySnapshot({
            status: null,
            catalog: null,
            source: null,
            sourceExtra: null,
            failed: true,
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [applySnapshot, bridge]);

  useEffect(() => {
    if (!busy || !bridge.available) {
      return;
    }
    let alive = true;
    const id = setInterval(() => {
      void bridge
        .getTask()
        .then((next) => {
          if (alive) {
            setTask(next);
          }
        })
        .catch(() => undefined);
    }, 800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [busy, bridge]);

  const run = useCallback(
    async (
      action: () => Promise<HarnessVersionResult>,
      successMessage: string | null,
      mutation?: HarnessVersionMutation,
    ) => {
      if (!bridge.available) {
        return;
      }
      setBusy(true);
      setTask(null);
      try {
        const result = await action();
        if (!result.ok) {
          if (result.cancelled) {
            bridge.notify(t.harnessVersionCancelled, 'warning');
          } else if (!result.silent) {
            bridge.notify(result.error || t.harnessVersionOpFailed, 'error');
          }
          return;
        }
        const afterMutation = bridge.afterMutation;
        let follow: HarnessVersionResult | null = null;
        if (mutation && afterMutation) {
          follow = await afterMutation(mutation);
          if (!follow.ok) {
            if (follow.cancelled) {
              bridge.notify(t.harnessVersionCancelled, 'warning');
            } else if (!follow.silent) {
              bridge.notify(follow.error || t.harnessVersionOpFailed, 'error');
            }
            return;
          }
        }
        // 适配器可提供工具专属完成文案；`null` 表示由适配器自行提示（DSH 的
        // 来源切换对话框），卡片不追加通用成功提示。
        const message = follow?.message ?? result.message ?? successMessage;
        if (message) {
          bridge.notify(message, 'success');
        }
      } catch {
        bridge.notify(t.harnessVersionOpFailed, 'error');
      } finally {
        setBusy(false);
        setTask(null);
        await refresh();
      }
    },
    [bridge, refresh, t],
  );

  const status = snapshot?.status ?? null;
  const catalog = snapshot?.catalog ?? null;
  const source = snapshot?.source ?? null;
  const sourceExtra = snapshot?.sourceExtra ?? null;
  const current = status?.currentSelected ?? null;
  const installed = useMemo(() => status?.installed ?? [], [status]);
  const stable = useMemo(() => catalog?.stable ?? [], [catalog]);
  const latestPrerelease = catalog?.prerelease[0] ?? null;
  // 稳定桶为空但后端给出 latestStable 时，稳定行仍要能解析到该版本。
  const stableInfos = useMemo(() => {
    const list = catalog?.stable ?? [];
    if (list.length === 0 && catalog?.latestStable) {
      return [{ version: catalog.latestStable, publishedAt: null }];
    }
    return list;
  }, [catalog]);
  const prereleaseInfos = useMemo(() => catalog?.prerelease ?? [], [catalog]);
  // 目录拉取失败 / 预发布未知：通道显示「未知」，不得误报「官方暂无」。
  const channelUnknown = snapshot?.catalogFailed === true || status?.prereleaseUnknown === true;
  const channelPicker = bridge.capabilities?.channelPicker === true;
  const stableEffective = pickEffective(stableInfos, stableChoice, current);
  const prereleaseEffective = pickEffective(prereleaseInfos, prereleaseChoice, current);
  const sourceMode = source?.mode ?? 'auto';
  const disabled = busy || !bridge.available;
  /** 宿主是否管理版本；`managed === false` 时隐藏全部管理行（系统安装生效）。 */
  const managed = source?.managed !== false;

  useEffect(() => {
    setUninstallArmed(null);
  }, [current]);

  // 当前版本变化（安装/切换完成）后回到自动跟随，避免停留在旧选择上。
  useEffect(() => {
    setStableChoice(null);
    setPrereleaseChoice(null);
  }, [current]);

  const headerHint =
    slots.headerHint ?? formatT(t, 'harnessVersionHint', { tool: bridge.toolName });
  const sourceHint =
    slots.sourceHint ?? formatT(t, 'harnessVersionSourceHint', { tool: bridge.toolName });

  const effectiveLabel = (() => {
    switch (source?.effective) {
      case 'running':
        return t.harnessVersionSourceRunning;
      case 'host':
        return t.harnessVersionSourceHost;
      case 'system':
        return t.harnessVersionSourceSystem;
      default:
        return t.harnessVersionSourceNone;
    }
  })();

  const slotContext: HarnessVersionSlotContext<TSource> = {
    busy,
    disabled,
    source,
    sourceExtra,
    run,
    notify: bridge.notify,
  };

  const installVersion = (version: string) => {
    if (!version.trim()) {
      return;
    }
    void run(() => bridge.install(version.trim()), t.harnessVersionInstallStarted, 'install');
  };

  const handleUninstall = (version: string) => {
    if (
      bridge.capabilities?.uninstallConfirm &&
      version === current &&
      uninstallArmed !== version
    ) {
      setUninstallArmed(version);
      return;
    }
    setUninstallArmed(null);
    void run(() => bridge.uninstall(version), t.harnessVersionUninstalled, 'uninstall');
  };

  const handleSourceChange = (mode: HarnessVersionSourceMode) => {
    const deferredChange = bridge.changeSourceMode;
    if (bridge.capabilities?.sourceModeChange === 'deferred' && deferredChange) {
      // 延迟确认模式：对话框、立即/下次启动语义与提示都由适配器拥有。
      void run(() => deferredChange(mode), null);
      return;
    }
    void run(() => bridge.saveSourceMode(mode), t.harnessVersionSourceSaved);
  };

  /** 行内重装：当前版本走真重装；已装非当前版本只修目录、不改选中。 */
  const handleVersionReinstall = (version: string) => {
    if (version === current) {
      void run(() => bridge.reinstall(), t.harnessVersionReinstalled, 'reinstall');
      return;
    }
    if (bridge.reinstallVersion) {
      void run(() => bridge.reinstallVersion!(version), null);
      return;
    }
    void run(() => bridge.install(version), t.harnessVersionInstallStarted, 'install');
  };

  const toggleChannelMenu = (channel: ChannelKey, anchor: HTMLElement) => {
    if (openChannel === channel) {
      setOpenChannel(null);
      return;
    }
    menuAnchorRef.current = anchor;
    setOpenChannel(channel);
  };

  // 菜单几何：右对齐触发器、钳制在视口内；下方空间不足时向上翻。
  useLayoutEffect(() => {
    if (!openChannel) {
      setMenuStyle(null);
      return;
    }
    const update = () => {
      const anchor = menuAnchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - MENU_MARGIN - MENU_GAP;
      const above = rect.top - MENU_MARGIN - MENU_GAP;
      const flip = below < MENU_MIN_HEIGHT && above > below;
      setMenuStyle({
        position: 'fixed',
        minWidth: Math.max(rect.width, 200),
        maxHeight: Math.max(MENU_MIN_HEIGHT, flip ? above : below),
        overflowY: 'auto',
        right: Math.max(MENU_MARGIN, window.innerWidth - rect.right),
        ...(flip
          ? { bottom: window.innerHeight - rect.top + MENU_GAP }
          : { top: rect.bottom + MENU_GAP }),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [openChannel]);

  // 外部 mousedown 关闭：触发器自身的 mousedown 放行，由其 click 负责切换。
  useEffect(() => {
    if (!openChannel) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuPanelRef.current?.contains(target)) {
        return;
      }
      if (menuAnchorRef.current?.contains(target)) {
        return;
      }
      setOpenChannel(null);
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [openChannel]);

  useEffect(() => {
    if (!openChannel) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenChannel(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openChannel]);

  const pickChannelVersion = (channel: ChannelKey, version: string) => {
    if (channel === 'stable') {
      setStableChoice(version);
    } else {
      setPrereleaseChoice(version);
    }
    setOpenChannel(null);
  };

  /**
   * 双通道行（DSH）：选择器只切换本行展示的版本，安装/切换/卸载仍走行内按钮。
   * 每行同一时刻只展示一个版本（通道各自限量），完整列表在该行的选择菜单里。
   */
  const renderChannelRow = (
    channel: ChannelKey,
    infos: { version: string; publishedAt: string | null }[],
    effective: string | null,
    title: string,
    emptyText: string,
  ) => {
    const row = (control: ReactNode) => (
      <div
        className="adl-settings-row"
        data-settings-row={title}
        data-harness-channel={channel}
        key={channel}
      >
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{title}</span>
          </div>
        </div>
        <div className="adl-settings-row__control adl-harness-version__channel">{control}</div>
      </div>
    );

    if (!effective) {
      return row(
        <span className="adl-harness-version__value is-empty">
          {channelUnknown ? t.harnessVersionListUnknown : emptyText}
        </span>,
      );
    }

    const version = effective;
    const hit = infos.find((info) => info.version === version) ?? null;
    const time = hit ? formatPublishedAt(hit.publishedAt) : '';
    const isCurrent = version === current;
    const isInstalled = installed.includes(version);
    const menuOpen = openChannel === channel;
    const menuId = `adl-harness-version-menu-${channel}`;
    return row(
      <>
        <button
          type="button"
          className="adl-harness-version__picker"
          disabled={disabled}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          aria-controls={menuOpen ? menuId : undefined}
          aria-label={version}
          title={[
            version,
            isCurrent
              ? t.harnessVersionCurrentBadge
              : isInstalled
                ? t.harnessVersionInstalled
                : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          onClick={(event) => toggleChannelMenu(channel, event.currentTarget)}
        >
          <span className="adl-harness-version__picker-label">
            <span className="adl-harness-version__picker-version">{version}</span>
            {isCurrent ? (
              <span className="adl-harness-version__badge">{t.harnessVersionCurrentBadge}</span>
            ) : isInstalled ? (
              <span className="adl-harness-version__badge">{t.harnessVersionInstalled}</span>
            ) : null}
            <span className="adl-harness-version__picker-check" aria-hidden={!isCurrent}>
              {isCurrent ? <CheckIcon /> : null}
            </span>
          </span>
          <span className="adl-harness-version__picker-chevron">
            <ChevronDownIcon />
          </span>
        </button>
        {time ? <span className="adl-harness-version__channel-time">{time}</span> : null}
        <div className="adl-harness-version__actions">
          {isInstalled ? (
            <button
              type="button"
              className={`adl-harness-version__action-btn${
                uninstallArmed === version ? ' adl-harness-version__action-btn--danger' : ''
              }`}
              disabled={disabled}
              onClick={() => handleUninstall(version)}
            >
              {uninstallArmed === version
                ? t.harnessVersionConfirmUninstall
                : t.harnessVersionUninstall}
            </button>
          ) : null}
          {isInstalled ? (
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled}
              onClick={() => handleVersionReinstall(version)}
            >
              {t.harnessVersionReinstallAction}
            </button>
          ) : (
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled}
              onClick={() => installVersion(version)}
            >
              {t.harnessVersionInstall}
            </button>
          )}
          {isInstalled && !isCurrent ? (
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled}
              onClick={() =>
                void run(() => bridge.revert(version), t.harnessVersionSwitched, 'switch')
              }
            >
              {t.harnessVersionSwitchTo}
            </button>
          ) : null}
        </div>
        {menuOpen
          ? createPortal(
              <div
                id={menuId}
                ref={menuPanelRef}
                className="adl-harness-version__menu"
                role="listbox"
                aria-label={title}
                style={menuStyle ?? undefined}
              >
                {infos.map((info) => {
                  const v = info.version;
                  const itemInstalled = installed.includes(v);
                  const itemCurrent = v === current;
                  const picked = v === version;
                  const itemTime = formatPublishedAt(info.publishedAt);
                  return (
                    <div
                      key={v}
                      className="adl-harness-version__menu-item"
                      role="option"
                      aria-selected={picked}
                    >
                      <button
                        type="button"
                        className="adl-harness-version__menu-item-action"
                        disabled={disabled}
                        onClick={() => pickChannelVersion(channel, v)}
                      >
                        <span className="adl-harness-version__menu-item-version">{v}</span>
                        {itemTime ? (
                          <span className="adl-harness-version__menu-item-time">{itemTime}</span>
                        ) : null}
                      </button>
                      <div className="adl-harness-version__menu-item-badges">
                        {itemCurrent ? (
                          <span className="adl-harness-version__badge">
                            {t.harnessVersionCurrentBadge}
                          </span>
                        ) : itemInstalled ? (
                          <span className="adl-harness-version__badge">
                            {t.harnessVersionInstalled}
                          </span>
                        ) : null}
                        <span
                          className="adl-harness-version__menu-item-check"
                          aria-hidden={!picked}
                        >
                          {picked ? <CheckIcon /> : null}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
      </>,
    );
  };

  return (
    <div className="adl-harness-version">
      {slots.hideHeader ? null : (
        <div className="adl-settings-storage__header adl-settings-storage__header--section">
          <SettingsHintButton content={headerHint} />
          <SettingsHeader title={formatT(t, 'harnessVersionTitle', { tool: bridge.toolName })} />
        </div>
      )}

      <div className="adl-settings-card">
        <div className="adl-settings-row" data-settings-row={t.harnessVersionCurrent}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionCurrent}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-harness-version__value">
              {current ?? t.harnessVersionNotInstalled}
            </span>
            <span className="adl-harness-version__hint">
              {t.harnessVersionEffectiveSource}: {effectiveLabel}
            </span>
            {renderSlot(slots.runtimeReadout, slotContext)}
          </div>
        </div>

        {snapshot?.failed ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span className="adl-harness-version__hint">{t.harnessVersionLoadFailed}</span>
              </div>
            </div>
          </div>
        ) : null}

        {!snapshot?.failed &&
        bridge.capabilities?.missingBanner !== false &&
        status !== null &&
        installed.length === 0 ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span className="adl-harness-version__hint">
                  {slots.missingBanner
                    ? renderSlot(slots.missingBanner, slotContext)
                    : formatT(t, 'harnessVersionMissingBanner', { tool: bridge.toolName })}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {managed ? (
          <div className="adl-settings-row" data-settings-row={t.harnessVersionUpdate}>
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionUpdate}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <span className="adl-harness-version__hint">
                {status?.hasUpdate ? t.harnessVersionHasUpdate : t.harnessVersionNoUpdate}
              </span>
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled}
                onClick={() => void run(() => bridge.update(), t.harnessVersionUpdated, 'update')}
              >
                {t.harnessVersionUpdateAction}
              </button>
            </div>
          </div>
        ) : null}

        {managed && channelPicker
          ? renderChannelRow(
              'stable',
              stableInfos,
              stableEffective,
              t.harnessVersionStable,
              t.harnessVersionStableEmpty,
            )
          : null}

        {managed && channelPicker
          ? renderChannelRow(
              'prerelease',
              prereleaseInfos,
              prereleaseEffective,
              t.harnessVersionPrerelease,
              t.harnessVersionPrereleaseEmpty,
            )
          : null}

        {managed && !channelPicker ? (
          <div className="adl-settings-row" data-settings-row={t.harnessVersionStable}>
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionStable}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <select
                className="adl-settings-dropdown"
                value={stablePick}
                disabled={disabled || stable.length === 0}
                onChange={(event) => setStablePick(event.target.value)}
              >
                {stable.map((info) => (
                  <option key={info.version} value={info.version}>
                    {info.version}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled || !stablePick}
                onClick={() => installVersion(stablePick)}
              >
                {t.harnessVersionInstall}
              </button>
            </div>
          </div>
        ) : null}

        {managed && !channelPicker && latestPrerelease ? (
          <div className="adl-settings-row" data-settings-row={t.harnessVersionPrerelease}>
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionPrerelease}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <span className="adl-harness-version__value">{latestPrerelease.version}</span>
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled}
                onClick={() => installVersion(latestPrerelease.version)}
              >
                {t.harnessVersionInstall}
              </button>
            </div>
          </div>
        ) : null}

        {managed ? (
          <div className="adl-settings-row" data-settings-row={t.harnessVersionManual}>
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionManual}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <input
                className="adl-settings-input"
                value={manual}
                placeholder={t.harnessVersionManualPlaceholder}
                disabled={disabled}
                onChange={(event) => setManual(event.target.value)}
              />
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled || !manual.trim()}
                onClick={() => {
                  installVersion(manual);
                  setManual('');
                }}
              >
                {t.harnessVersionInstall}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {managed && installed.length > 0 ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row" data-settings-row={t.harnessVersionInstalled}>
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionInstalled}</span>
              </div>
            </div>
          </div>
          {installed.map((version) => (
            <div className="adl-settings-row" key={version} data-harness-version-row={version}>
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  <span>{version}</span>
                  {version === current ? (
                    <span className="adl-harness-version__badge">
                      {t.harnessVersionCurrentBadge}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="adl-settings-row__control">
                <button
                  type="button"
                  className="adl-harness-version__action-btn"
                  disabled={disabled || version === current}
                  onClick={() =>
                    void run(() => bridge.revert(version), t.harnessVersionSwitched, 'switch')
                  }
                >
                  {t.harnessVersionSwitch}
                </button>
                <button
                  type="button"
                  className="adl-harness-version__action-btn adl-harness-version__action-btn--danger"
                  disabled={disabled}
                  onClick={() => handleUninstall(version)}
                >
                  {uninstallArmed === version
                    ? t.harnessVersionConfirmUninstall
                    : t.harnessVersionUninstall}
                </button>
              </div>
            </div>
          ))}
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionReinstall}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled || !current}
                onClick={() =>
                  void run(() => bridge.reinstall(), t.harnessVersionReinstalled, 'reinstall')
                }
              >
                {t.harnessVersionReinstall}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-card">
        <div className="adl-settings-row" data-settings-row={t.harnessVersionSourceTitle}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={sourceHint} />
              <span>{t.harnessVersionSourceTitle}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <select
              className="adl-settings-dropdown"
              value={sourceMode}
              disabled={disabled}
              onChange={(event) =>
                handleSourceChange(event.target.value as HarnessVersionSourceMode)
              }
            >
              <option value="auto">{t.harnessVersionSourceAuto}</option>
              <option value="system">{t.harnessVersionSourceSystem}</option>
              <option value="host">{t.harnessVersionSourceHost}</option>
            </select>
          </div>
        </div>
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionSystemPath}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-harness-version__value">
              {source?.systemPath ?? t.harnessVersionSystemNotDetected}
            </span>
          </div>
        </div>
        {slots.sourceNote ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span className="adl-harness-version__hint">
                  {renderSlot(slots.sourceNote, slotContext)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {renderSlot(slots.sourceFooter, slotContext)}
      </div>

      {task ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>
                  {bridge.capabilities?.taskStageText === false
                    ? t.harnessVersionTaskRunning
                    : phaseLabel(task, t)}
                </span>
              </div>
            </div>
            <div className="adl-settings-row__control adl-harness-version__progress">
              {bridge.capabilities?.taskCounts && task.total > 0 ? (
                <span className="adl-harness-version__hint">
                  {formatT(t, 'harnessVersionTaskCount', { done: task.done, total: task.total })}
                </span>
              ) : null}
              <span className="adl-harness-version__value">
                {task.percent === null ? '—' : `${task.percent}%`}
              </span>
              {task.cancellable ? (
                <button
                  type="button"
                  className="adl-harness-version__action-btn"
                  onClick={() => void bridge.cancel()}
                >
                  {t.harnessVersionCancel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {bridge.capabilities?.resetSourceAction !== false ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionResetDefaults}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled || sourceMode === 'auto'}
                onClick={() => void run(() => bridge.resetSourceMode(), t.harnessVersionResetDone)}
              >
                {t.harnessVersionResetDefaults}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renderSlot(slots.footer, slotContext)}
    </div>
  );
}
