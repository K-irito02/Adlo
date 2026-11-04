import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgentSiteAllowEntry, SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { normalizeAgentSiteEntries, normalizeOrigin } from '@shared/originWhitelist';
import { IconChevronDown, IconTrash } from '../../icons';

interface AgentAllowlistControlProps {
  item: SettingItem;
  t: CopyDict;
  onChange: (value: AgentSiteAllowEntry[]) => void;
  /**
   * 对话框文案覆盖（事项 4）：默认用智能体白名单文案；挂起白名单传入自己的
   * 标题与网址占位（无硬编码，调用方传 i18n 解析值）。
   */
  texts?: {
    dialogTitle: string;
    originPlaceholder: string;
  };
}

/** 设置行展示用的白名单：与保存路径同源归一（字符串残留不丢、path/query 变体不重复渲染）。 */
function asAllowlist(value: SettingItem['value']): AgentSiteAllowEntry[] {
  return normalizeAgentSiteEntries(value);
}

interface MenuGeometry {
  top: number;
  left: number;
  width: number;
}

/**
 * 智能体网址白名单（事项 2b）：「查看管理白名单」下拉（与添加同行）+ 「添加」按钮。
 * 已保存条目收进下拉菜单卡片，每条配垃圾桶移出图标按钮；空态提示由行左侧副标题下方展示
 * （见 `SettingsControls`），此处 control 列不再渲染空态文案与内联列表。
 * 新增交互复用浏览器落地页添加对话框的 `adl-prompt-modal` 卡片语言。
 */
export function AgentAllowlistControl({ item, t, onChange, texts }: AgentAllowlistControlProps) {
  const entries = asAllowlist(item.value);
  const dialogTitle = texts?.dialogTitle ?? t.settingsAgentAllowTitle;
  const originPlaceholder = texts?.originPlaceholder ?? t.settingsAgentAllowOriginPlaceholder;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGeometry, setMenuGeometry] = useState<MenuGeometry | null>(null);
  const [alias, setAlias] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [error, setError] = useState('');
  const siteRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dialogOpen) {
      setAlias('');
      setSiteUrl('');
      setError('');
      const raf = requestAnimationFrame(() => {
        siteRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [dialogOpen]);

  const handleOpen = useCallback(() => {
    setMenuOpen(false);
    setDialogOpen(true);
  }, []);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    const rawSite = siteUrl.trim();
    if (!rawSite) {
      setError(t.settingsAgentAllowOriginRequired);
      return;
    }
    const origin = normalizeOrigin(rawSite);
    if (!origin) {
      setError(t.settingsAgentAllowOriginInvalid);
      return;
    }
    const trimmedAlias = alias.trim();
    const exists = entries.some((entry) => entry.origin === origin);
    const next = exists
      ? entries.map((entry) =>
          entry.origin === origin
            ? trimmedAlias
              ? { alias: trimmedAlias, origin }
              : { origin }
            : entry,
        )
      : [...entries, ...(trimmedAlias ? [{ alias: trimmedAlias, origin }] : [{ origin }])];
    onChange(next);
    setDialogOpen(false);
  }, [alias, entries, onChange, siteUrl, t]);

  // Enter 仅在文本框内确认：焦点落在取消/确认按钮上时，按钮原生 click
  // 已能完成对应动作，不再经冒泡重复触发（事项 5 复审 R2-02：否则在取消按钮
  // 上按 Enter 会同时走确认分支把条目加上）。Escape 保持全局关闭。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // IME 组字中（中文别名输入）的 Enter 是组字确认，不是表单确认。
      if (e.nativeEvent.isComposing) {
        return;
      }
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
        handleConfirm();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleCancel, handleConfirm],
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel],
  );

  const handleRemove = useCallback(
    (origin: string) => {
      onChange(entries.filter((entry) => entry.origin !== origin));
    },
    [entries, onChange],
  );

  const updateMenuGeometry = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    // 菜单卡片与触发按钮等宽对齐（事项 2d）：宽取按钮宽，左对齐，仅做视口钳制。
    const rect = trigger.getBoundingClientRect();
    const width = rect.width;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setMenuGeometry({ top: rect.bottom + 4, left, width });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  // 条目被清空时关菜单（事项 2d）：触发按钮随之禁用，残留的几何旧菜单会缩成细条，
  // 必须同步关闭。注意 entries 身份每渲染都变，只依赖长度。
  const entryCount = entries.length;
  useEffect(() => {
    if (entryCount === 0) {
      setMenuOpen(false);
    }
  }, [entryCount]);

  // 下拉菜单：外部点击关闭、Escape 关闭并回焦点、祖先滚动/视口变化跟随触发器。
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    updateMenuGeometry();
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
        triggerRef.current?.focus();
      }
    };
    const handleReposition = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) {
        return;
      }
      updateMenuGeometry();
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', updateMenuGeometry);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', updateMenuGeometry);
    };
  }, [menuOpen, closeMenu, updateMenuGeometry]);

  return (
    <div className="adl-settings-allowlist">
      <div className="adl-settings-allowlist__actions">
        <div className="adl-settings-dropdown adl-settings-allowlist__manage">
          <button
            ref={triggerRef}
            type="button"
            className="adl-settings-dropdown__trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t.settingsAgentAllowManage}
            disabled={item.disabled || entries.length === 0}
            onClick={() => {
              if (item.disabled || entries.length === 0) {
                return;
              }
              setMenuOpen((open) => !open);
            }}
          >
            <span className="adl-settings-dropdown__value">{t.settingsAgentAllowManage}</span>
            <IconChevronDown size={14} decorative />
          </button>
        </div>
        <button
          type="button"
          className="adl-dsh-settings__action-btn"
          onClick={handleOpen}
          disabled={item.disabled}
        >
          {t.settingsAgentAllowAdd}
        </button>
      </div>
      {menuOpen &&
        menuGeometry &&
        createPortal(
          <div
            ref={menuRef}
            className="adl-settings-dropdown__menu"
            role="menu"
            aria-label={t.settingsAgentAllowManage}
            style={{
              top: menuGeometry.top,
              left: menuGeometry.left,
              width: menuGeometry.width,
            }}
          >
            <ul className="adl-settings-dropdown__list">
              {entries.map((entry) => (
                <li
                  key={entry.origin}
                  className="adl-settings-allowlist__menu-item"
                  role="presentation"
                >
                  <span
                    className="adl-settings-allowlist__origin"
                    title={entry.origin}
                    role="menuitem"
                  >
                    {entry.alias ? `${entry.alias} · ${entry.origin}` : entry.origin}
                  </span>
                  <button
                    type="button"
                    className="adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover"
                    onClick={() => handleRemove(entry.origin)}
                    disabled={item.disabled}
                    title={t.settingsAgentAllowRemoveTitle}
                    aria-label={`${t.settingsAgentAllowRemove} ${entry.alias ? `${entry.alias} ${entry.origin}` : entry.origin}`}
                  >
                    <IconTrash size={14} decorative />
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
      {dialogOpen &&
        createPortal(
          <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
            <div
              className="adl-prompt-modal__panel"
              role="dialog"
              aria-modal="true"
              aria-label={dialogTitle}
            >
              <div className="adl-prompt-modal__header">
                {dialogTitle}
                <button
                  type="button"
                  className="adl-prompt-modal__header-close"
                  onClick={handleCancel}
                  aria-label={t.close}
                >
                  ✕
                </button>
              </div>
              <div className="adl-prompt-modal__body adl-prompt-modal__body--compact">
                <div>
                  <label className="adl-settings-allowlist__label" htmlFor="adl-allow-alias">
                    {t.settingsAgentAllowAlias}
                  </label>
                  <input
                    id="adl-allow-alias"
                    className="adl-prompt-modal__input"
                    type="text"
                    value={alias}
                    autoComplete="off"
                    placeholder={t.settingsAgentAllowAliasPlaceholder}
                    onChange={(e) => setAlias(e.currentTarget.value)}
                  />
                </div>
                <div>
                  <label className="adl-settings-allowlist__label" htmlFor="adl-allow-site">
                    {t.settingsAgentAllowOrigin}
                  </label>
                  <input
                    id="adl-allow-site"
                    ref={siteRef}
                    className="adl-prompt-modal__input"
                    type="text"
                    value={siteUrl}
                    autoComplete="off"
                    placeholder={originPlaceholder}
                    onChange={(e) => {
                      setSiteUrl(e.currentTarget.value);
                      if (error) {
                        setError('');
                      }
                    }}
                  />
                </div>
                {error && <p className="adl-prompt-modal__error">{error}</p>}
              </div>
              <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
                <button
                  type="button"
                  className="adl-btn adl-btn--ghost adl-btn--square"
                  onClick={handleCancel}
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  className="adl-btn adl-btn--primary adl-btn--square"
                  onClick={handleConfirm}
                >
                  {t.settingsAgentAllowAdd}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
