import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import {
  SettingsRowRefresh,
  type SettingsRowRefreshState,
} from '@components/settings/SettingsRefreshButton';
import { RevealScrollbar } from '@components/RevealScrollbar';
import { useRevealScrollbar } from '@hooks/useRevealScrollbar';
import { formatPublishedAt } from '../harnessVersionFormat';
import type { HarnessChannelKey, HarnessMenuGeometry } from '../hooks/useHarnessVersionChannelMenu';
import type { HarnessVersionTask } from '../harnessVersionBridge';
import { CheckIcon, ChevronDownIcon } from './icons';

export interface HarnessChannelInfo {
  version: string;
  publishedAt: string | null;
}

/** 作用行内的任务态（旧 `renderVersionRowAction` 的任务分支）。 */
export interface HarnessChannelTask {
  shownTask: HarnessVersionTask | null;
  hasLiveTask: boolean;
  stageText: string;
  countsText: string;
  cancelLabel: string;
  cancellable: boolean;
  onCancel: () => void;
}

interface ChannelRowProps {
  channel: HarnessChannelKey;
  title: string;
  /** 行内「?」提示内容（DSH 传入通道说明；缺省不渲染）。 */
  hint?: string;
  /** 标签下描述小字（旧行文案；缺省不渲染）。 */
  desc?: string;
  infos: HarnessChannelInfo[];
  effective: string | null;
  current: string | null;
  installed: string[];
  unknown: boolean;
  emptyText: string;
  disabled: boolean;
  menuOpen: boolean;
  menuGeometry: HarnessMenuGeometry | null;
  menuPanelRef: RefObject<HTMLDivElement | null>;
  fixedWidth: number | null;
  /** 本行展示版本在途的任务（`shownTask.version === effective` 时行内展示）。 */
  task: HarnessChannelTask | null;
  /** 本行刷新（目录腿）：标题右侧悬停显现；缺省不渲染。 */
  refresh?: SettingsRowRefreshState;
  /** 控件区扫光态（本腿刷新在途且已有旧值）。 */
  spinning?: boolean;
  uninstallArmed: string | null;
  onToggle: (channel: HarnessChannelKey, anchor: HTMLElement) => void;
  onPick: (channel: HarnessChannelKey, version: string) => void;
  onInstall: (version: string) => void;
  onUninstall: (version: string) => void;
  onReinstall: (version: string) => void;
  onSwitch: (version: string) => void;
}

/**
 * 双通道行（旧 DSH 正式版本/预发布版本行）：标签在上、控件独占下一行整宽；
 * 选择器只切换本行展示的版本，安装/切换/卸载仍走行内按钮；在途任务行内展示。
 */
export function ChannelRow({
  channel,
  title,
  hint,
  desc,
  infos,
  effective,
  current,
  installed,
  unknown,
  emptyText,
  disabled,
  menuOpen,
  menuGeometry,
  menuPanelRef,
  fixedWidth,
  task,
  refresh,
  spinning,
  uninstallArmed,
  onToggle,
  onPick,
  onInstall,
  onUninstall,
  onReinstall,
  onSwitch,
}: ChannelRowProps) {
  const { t, locale } = useTCopy();
  const row = (control: ReactNode, overlay = false) => (
    <div
      className={`adl-settings-row${infos.length > 0 ? ' adl-harness-version__row--stack' : ''}`}
      data-settings-row={title}
      data-harness-channel={channel}
      key={channel}
    >
      <div className="adl-settings-row__label">
        <div className="adl-settings-row__label-text">
          {hint ? <SettingsHintButton content={hint} /> : null}
          <span>{title}</span>
          <SettingsRowRefresh refresh={refresh} disabled={disabled} />
        </div>
        {desc ? <small>{desc}</small> : null}
      </div>
      <div className="adl-settings-row__control">
        <div className="adl-harness-version__control-slot adl-harness-version__control-slot--start">
          <div
            className={`adl-harness-version__control-body${
              overlay ? ' adl-harness-version__control-hidden' : ''
            }`}
          >
            {control}
          </div>
          {overlay ? (
            <span
              className="adl-harness-version__readout-loading adl-harness-version__control-overlay"
              role="status"
              aria-label={t.harnessVersionLoading}
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  if (!effective) {
    return row(
      <span className="adl-harness-version__readout-value is-empty">
        {unknown ? t.harnessVersionListUnknown : emptyText}
      </span>,
      spinning === true,
    );
  }

  const version = effective;
  const hit = infos.find((info) => info.version === version) ?? null;
  const time = hit ? formatPublishedAt(hit.publishedAt, locale) : '';
  const isCurrent = version === current;
  const isInstalled = installed.includes(version);
  return row(
    <div className="adl-harness-version__version-list">
      <div
        key={version}
        className={`adl-harness-version__version-list-item${
          isCurrent ? ' adl-harness-version__version-list-item--current' : ''
        }`}
      >
        <button
          type="button"
          className="adl-harness-version__version-picker"
          style={fixedWidth != null ? { width: fixedWidth } : undefined}
          onClick={(event) => onToggle(channel, event.currentTarget)}
          disabled={disabled}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
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
        >
          <span className="adl-harness-version__version-picker-label">
            <span className="adl-harness-version__version-picker-version">{version}</span>
            {/* 与菜单卡片同一口径：当前版本 > 已装版本，单徽章互斥。 */}
            {isCurrent ? (
              <span className="adl-harness-version__version-menu-item-installed adl-harness-version__version-menu-item-current">
                {t.harnessVersionCurrentBadge}
              </span>
            ) : isInstalled ? (
              <span className="adl-harness-version__version-menu-item-installed">
                {t.harnessVersionInstalled}
              </span>
            ) : null}
            <span className="adl-harness-version__version-menu-item-check" aria-hidden={!isCurrent}>
              {isCurrent ? <CheckIcon /> : null}
            </span>
          </span>
          <span className="adl-harness-version__version-picker-chevron">
            <ChevronDownIcon />
          </span>
        </button>
        {/* 任务进行中时隐藏发布时间：任务行只保留阶段文案＋取消按钮。 */}
        {task ? null : time ? (
          <span className="adl-harness-version__version-list-item-time">{time}</span>
        ) : null}
        {task ? (
          <div className="adl-harness-version__version-task">
            <span className="adl-harness-version__version-task-stage" aria-live="polite">
              <span className="adl-harness-version__version-task-shimmer">{task.stageText}</span>
              {task.countsText ? (
                <span className="adl-harness-version__version-task-count">{task.countsText}</span>
              ) : null}
            </span>
            <button
              type="button"
              className="adl-harness-version__action-btn"
              onClick={() => task.onCancel()}
              disabled={!task.hasLiveTask || !task.cancellable}
            >
              {task.cancelLabel}
            </button>
          </div>
        ) : (
          <div className="adl-harness-version__version-list-actions">
            {isInstalled ? (
              <button
                type="button"
                className={`adl-harness-version__action-btn${
                  uninstallArmed === version ? ' adl-harness-version__action-btn--danger' : ''
                }`}
                onClick={() => onUninstall(version)}
                disabled={disabled}
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
                onClick={() => onReinstall(version)}
                disabled={disabled}
              >
                {t.harnessVersionReinstallAction}
              </button>
            ) : (
              <button
                type="button"
                className="adl-harness-version__action-btn"
                onClick={() => onInstall(version)}
                disabled={disabled}
              >
                {t.harnessVersionInstall}
              </button>
            )}
            {isInstalled && !isCurrent ? (
              <button
                type="button"
                className="adl-harness-version__action-btn"
                onClick={() => onSwitch(version)}
                disabled={disabled}
              >
                {t.harnessVersionSwitchTo}
              </button>
            ) : null}
          </div>
        )}
        {menuOpen && menuGeometry
          ? createPortal(
              <ChannelMenu
                title={title}
                infos={infos}
                effective={version}
                current={current}
                installed={installed}
                disabled={disabled}
                geometry={menuGeometry}
                panelRef={menuPanelRef}
                onPick={(picked) => onPick(channel, picked)}
              />,
              document.body,
            )
          : null}
      </div>
    </div>,
    spinning === true,
  );
}

interface ChannelMenuProps {
  title: string;
  infos: HarnessChannelInfo[];
  /** 下拉框当前展示的版本（菜单内勾选标记跟随它）。 */
  effective: string;
  current: string | null;
  installed: string[];
  disabled: boolean;
  geometry: HarnessMenuGeometry;
  panelRef: RefObject<HTMLDivElement | null>;
  onPick: (version: string) => void;
}

/** 版本选择下拉菜单（Portal）：列出所属分区全部版本，点击只切换展示。 */
function ChannelMenu({
  title,
  infos,
  effective,
  current,
  installed,
  disabled,
  geometry,
  panelRef,
  onPick,
}: ChannelMenuProps) {
  const { t, locale } = useTCopy();
  const scrollbar = useRevealScrollbar([infos.length, geometry !== null]);
  return (
    <div
      ref={panelRef}
      className="adl-harness-version__version-menu"
      role="listbox"
      aria-label={title}
      style={{
        top: geometry.top,
        bottom: geometry.bottom,
        left: geometry.left,
        width: geometry.width,
        maxHeight: geometry.maxHeight,
      }}
      {...scrollbar.hoverProps}
    >
      <div
        className="adl-harness-version__version-menu-list adl-reveal-scroll"
        ref={scrollbar.scrollRef as unknown as React.Ref<HTMLDivElement>}
        style={
          geometry.maxHeight != null
            ? { maxHeight: Math.max(0, geometry.maxHeight - 8) }
            : undefined
        }
      >
        {infos.map((info) => {
          const v = info.version;
          const isInstalled = installed.includes(v);
          const isPicked = v === effective;
          const time = formatPublishedAt(info.publishedAt, locale);
          return (
            <div
              key={v}
              className="adl-harness-version__version-menu-item"
              role="option"
              aria-selected={isPicked}
            >
              <button
                type="button"
                className="adl-harness-version__version-menu-item-revert"
                onClick={() => onPick(v)}
                disabled={disabled}
              >
                <span className="adl-harness-version__version-menu-item-version">{v}</span>
                {time ? (
                  <span className="adl-harness-version__version-menu-item-time">{time}</span>
                ) : null}
              </button>
              <div className="adl-harness-version__version-menu-item-badges">
                {/* 每行最多一个状态徽章，优先级：当前版本 > 已装版本。
                    勾号槽位常驻（未选中时留空）：徽章不会因勾号出现而左移。 */}
                {v === current ? (
                  <span className="adl-harness-version__version-menu-item-installed adl-harness-version__version-menu-item-current">
                    {t.harnessVersionCurrentBadge}
                  </span>
                ) : isInstalled ? (
                  <span className="adl-harness-version__version-menu-item-installed">
                    {t.harnessVersionInstalled}
                  </span>
                ) : null}
                <span
                  className="adl-harness-version__version-menu-item-check"
                  aria-hidden={!isPicked}
                >
                  {isPicked ? <CheckIcon /> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <RevealScrollbar
        controller={scrollbar.scrollable ? { ...scrollbar, visible: true } : scrollbar}
      />
    </div>
  );
}

interface ChannelSizerProps {
  longestStable: string | null;
  longestPrerelease: string | null;
  refs: {
    stableSizerRef: RefObject<HTMLDivElement | null>;
    prereleaseSizerRef: RefObject<HTMLDivElement | null>;
    stablePickerSizerRef: RefObject<HTMLDivElement | null>;
    prereleasePickerSizerRef: RefObject<HTMLDivElement | null>;
  };
}

/**
 * 宽度测量尺（隐藏）：取分区最长选项实测宽度，下拉框与菜单卡片同宽，
 * 保证菜单内“版本号 + 徽章”全部单行。结构与真实菜单项一致，同类名保证
 * 字体/间距一致；外加收缩类避免块级拉伸。另附下拉框 replica（含箭头）：
 * 两者取最大，否则横向下拉框内容超出纵向菜单项宽度时勾选压住箭头。
 */
export function ChannelSizer({ longestStable, longestPrerelease, refs }: ChannelSizerProps) {
  const { t } = useTCopy();
  const menuItem = (longest: string, ref: RefObject<HTMLDivElement | null>) => (
    <div
      ref={ref}
      className="adl-harness-version__version-menu-item adl-harness-version__version-sizer-item"
    >
      <span className="adl-harness-version__version-menu-item-revert">
        <span className="adl-harness-version__version-menu-item-version">{longest}</span>
        <span className="adl-harness-version__version-menu-item-time">0000-00-00 00:00</span>
      </span>
      <span className="adl-harness-version__version-menu-item-badges">
        <span className="adl-harness-version__version-menu-item-installed">
          {t.harnessVersionInstalled}
        </span>
        <span className="adl-harness-version__version-menu-item-check">
          <CheckIcon />
        </span>
      </span>
    </div>
  );
  const picker = (longest: string, ref: RefObject<HTMLDivElement | null>) => (
    <div ref={ref} className="adl-harness-version__version-picker">
      <span className="adl-harness-version__version-picker-label">
        <span className="adl-harness-version__version-picker-version">{longest}</span>
        <span className="adl-harness-version__version-menu-item-installed">
          {t.harnessVersionInstalled}
        </span>
        <span className="adl-harness-version__version-menu-item-check">
          <CheckIcon />
        </span>
      </span>
      <span className="adl-harness-version__version-picker-chevron">
        <ChevronDownIcon />
      </span>
    </div>
  );
  return (
    <div aria-hidden="true" className="adl-harness-version__version-sizer">
      {longestStable ? menuItem(longestStable, refs.stableSizerRef) : null}
      {longestStable ? picker(longestStable, refs.stablePickerSizerRef) : null}
      {longestPrerelease ? menuItem(longestPrerelease, refs.prereleaseSizerRef) : null}
      {longestPrerelease ? picker(longestPrerelease, refs.prereleasePickerSizerRef) : null}
    </div>
  );
}
