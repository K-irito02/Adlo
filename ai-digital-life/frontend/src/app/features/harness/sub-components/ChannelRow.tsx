import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatPublishedAt } from '../harnessVersionFormat';
import type { HarnessChannelKey } from '../hooks/useHarnessVersionChannelMenu';
import { CheckIcon, ChevronDownIcon } from './icons';

export interface HarnessChannelInfo {
  version: string;
  publishedAt: string | null;
}

interface ChannelRowProps {
  channel: HarnessChannelKey;
  title: string;
  infos: HarnessChannelInfo[];
  effective: string | null;
  current: string | null;
  installed: string[];
  unknown: boolean;
  emptyText: string;
  disabled: boolean;
  menuOpen: boolean;
  menuStyle: CSSProperties | null;
  menuAnchorRef: RefObject<HTMLElement | null>;
  menuPanelRef: RefObject<HTMLDivElement | null>;
  uninstallArmed: string | null;
  onToggle: (channel: HarnessChannelKey, anchor: HTMLElement) => void;
  onPick: (channel: HarnessChannelKey, version: string) => void;
  onInstall: (version: string) => void;
  onUninstall: (version: string) => void;
  onReinstall: (version: string) => void;
  onSwitch: (version: string) => void;
}

/**
 * 双通道行（DSH）：选择器只切换本行展示的版本，安装/切换/卸载仍走行内按钮。
 * 每行同一时刻只展示一个版本（通道各自限量），完整列表在该行的选择菜单里。
 */
export function ChannelRow({
  channel,
  title,
  infos,
  effective,
  current,
  installed,
  unknown,
  emptyText,
  disabled,
  menuOpen,
  menuStyle,
  menuAnchorRef,
  menuPanelRef,
  uninstallArmed,
  onToggle,
  onPick,
  onInstall,
  onUninstall,
  onReinstall,
  onSwitch,
}: ChannelRowProps) {
  const { t, locale } = useTCopy();

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
        {unknown ? t.harnessVersionListUnknown : emptyText}
      </span>,
    );
  }

  const version = effective;
  const hit = infos.find((info) => info.version === version) ?? null;
  const time = hit ? formatPublishedAt(hit.publishedAt, locale) : '';
  const isCurrent = version === current;
  const isInstalled = installed.includes(version);
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
          isCurrent ? t.harnessVersionCurrentBadge : isInstalled ? t.harnessVersionInstalled : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        onClick={(event) => onToggle(channel, event.currentTarget)}
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
            onClick={() => onUninstall(version)}
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
            onClick={() => onReinstall(version)}
          >
            {t.harnessVersionReinstallAction}
          </button>
        ) : (
          <button
            type="button"
            className="adl-harness-version__action-btn"
            disabled={disabled}
            onClick={() => onInstall(version)}
          >
            {t.harnessVersionInstall}
          </button>
        )}
        {isInstalled && !isCurrent ? (
          <button
            type="button"
            className="adl-harness-version__action-btn"
            disabled={disabled}
            onClick={() => onSwitch(version)}
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
                const picked = v === version;
                const itemTime = formatPublishedAt(info.publishedAt, locale);
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
                      onClick={() => onPick(channel, v)}
                    >
                      <span className="adl-harness-version__menu-item-version">{v}</span>
                      {itemTime ? (
                        <span className="adl-harness-version__menu-item-time">{itemTime}</span>
                      ) : null}
                    </button>
                    <div className="adl-harness-version__menu-item-badges">
                      {v === current ? (
                        <span className="adl-harness-version__badge">
                          {t.harnessVersionCurrentBadge}
                        </span>
                      ) : installed.includes(v) ? (
                        <span className="adl-harness-version__badge">
                          {t.harnessVersionInstalled}
                        </span>
                      ) : null}
                      <span className="adl-harness-version__menu-item-check" aria-hidden={!picked}>
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
}
