import React, { Fragment, useState, useEffect, useRef, useMemo, type ChangeEvent } from 'react';
import type { SettingItem, SettingValue } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import type { CopyDict } from '../../i18n';
import { IconEye, IconEyeOff, IconResetDefaults } from '../../icons';
import { FontControl } from './FontControl';
import { SettingsSelect } from './SettingsSelect';
import { AgentAllowlistControl } from './AgentAllowlistControl';
import { AgentSiteRulesControl } from './AgentSiteRulesControl';
import { AgentSiteRulesPanel } from './AgentSiteRulesPanel';
import { clearAgentSiteRulesDraftBackup } from './agentSiteRulesDraftBackup';
import { ConfirmDialog } from '../ConfirmDialog';
import { normalizeAgentSiteEntries } from '../../../shared/originWhitelist';
import { getDefaultForSetting } from '../../../shared/defaultPreferences';
import { isStringArrayEqual } from './settingsGroups';
import { anchorFor } from './settingsSearchIndex';

interface SettingsControlsProps {
  items: SettingItem[];
  onChange: (id: string, value: SettingValue) => void;
}

interface PendingReset {
  itemId: string;
  value: SettingValue;
  title: string;
  message: string;
}

/** 当前值是否已等于默认值：等于则行级恢复按钮禁用。
 * 非数组用 `===`（typeof 不一致即不等，保持启用 fail-open；NaN 恒不等亦然）。
 * 数组分支走共享 helper。 */
function isDefaultValue(value: unknown, defaultValue: unknown): boolean {
  if (Array.isArray(value) || Array.isArray(defaultValue)) {
    return isStringArrayEqual(
      Array.isArray(value) ? (value as string[]) : undefined,
      Array.isArray(defaultValue) ? (defaultValue as string[]) : undefined,
    );
  }
  return value === defaultValue;
}

export function ToggleControl({
  item,
  onChange,
  testId,
}: {
  item: SettingItem;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  const checked = !!item.value;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={item.label}
      disabled={item.disabled}
      data-testid={testId}
      className={`adl-settings-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="adl-settings-toggle__track">
        <span className="adl-settings-toggle__thumb" />
      </span>
    </button>
  );
}

function SelectControl({
  item,
  onChange,
  className,
}: {
  item: SettingItem;
  onChange: (v: string) => void;
  className?: string;
}) {
  // options 身份稳定，避免下游 SettingsSelect 订阅 effect 每渲染重绑监听。
  const options = useMemo(
    () => (item.options ?? []).map((opt) => ({ value: opt.value, label: opt.label })),
    [item.options],
  );
  return (
    <SettingsSelect
      value={String(item.value)}
      options={options}
      onChange={onChange}
      label={item.label}
      className={className}
    />
  );
}

export function InputControl({
  item,
  onChange,
}: {
  item: SettingItem;
  onChange: (v: string) => void;
}) {
  const [localValue, setLocalValue] = useState(String(item.value));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(String(item.value));
  }, [item.value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    if (item.type === 'readonly') {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      onChange(next);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <input
      type="text"
      className="adl-settings-input"
      value={localValue}
      readOnly={item.type === 'readonly'}
      onChange={handleChange}
    />
  );
}

function PasswordControl({
  item,
  onChange,
  t,
}: {
  item: SettingItem;
  onChange: (v: string) => void;
  t: CopyDict;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="adl-settings-password">
      <input
        type={visible ? 'text' : 'password'}
        className="adl-settings-input"
        value={String(item.value)}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="adl-icon-btn adl-icon-btn--xs"
        onClick={() => setVisible((v) => !v)}
        aria-label={t.settingsToggleVisibility}
      >
        {visible ? <IconEyeOff size={14} decorative /> : <IconEye size={14} decorative />}
      </button>
    </div>
  );
}

export function SettingsControls({ items, onChange }: SettingsControlsProps) {
  const { t } = useTCopy();
  const [openRulesId, setOpenRulesId] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState<PendingReset | null>(null);
  const suppressAutoSaveRef = useRef(false);

  // 设置组切换 / 拦截开关关闭后，已展开的行可能不再渲染：同步收起，避免下次
  // 重新出现时处于“看不见的展开态”。
  useEffect(() => {
    if (openRulesId && !items.some((item) => item.id === openRulesId)) {
      setOpenRulesId(null);
    }
  }, [items, openRulesId]);

  if (items.length === 0) {
    return (
      <div className="adl-settings-card adl-settings-controls-wrap">
        <p className="adl-empty-hint">{t.noResults}</p>
      </div>
    );
  }

  const handleReset = (item: SettingItem, value: SettingValue) => {
    if (item.resetConfirm) {
      setPendingReset({
        itemId: item.id,
        value,
        title: item.resetConfirm.title,
        message: item.resetConfirm.message,
      });
      return;
    }
    onChange(item.id, value);
  };

  const confirmReset = () => {
    if (!pendingReset) {
      return;
    }
    // 结构性重置会替换整份规则：先抑制面板卸载时的自动保存，避免旧草稿覆盖重置结果。
    if (pendingReset.itemId === 'openMethod:agentSiteRules') {
      suppressAutoSaveRef.current = true;
      // 面板可能已卸载：清掉上次未提交的本地草稿，避免重开时把重置结果覆盖回去。
      clearAgentSiteRulesDraftBackup(pendingReset.itemId);
    }
    onChange(pendingReset.itemId, pendingReset.value);
    if (pendingReset.itemId === 'openMethod:agentSiteRules') {
      setOpenRulesId(null);
      window.setTimeout(() => {
        suppressAutoSaveRef.current = false;
      }, 0);
    }
    setPendingReset(null);
  };

  return (
    <div className="adl-settings-card adl-settings-controls-wrap">
      <div className="adl-settings-controls">
        {items.map((item, index) => {
          const resetValue =
            item.resetValue !== undefined ? item.resetValue : getDefaultForSetting(item.id);
          const canReset = item.type !== 'readonly' && resetValue !== undefined;
          const isDefault =
            canReset && (item.resetDisabled ?? isDefaultValue(item.value, resetValue));
          // 拦截开关联动的白名单与拦截行视为同一组：白名单存在时去掉拦截行的底部分隔线；
          // 白名单与拦截规则之间也不再画分隔线（用户要求两组视觉上连成一体）。
          const nextId = items[index + 1]?.id;
          const rulesOpen = item.type === 'agentSiteRules' && openRulesId === item.id;
          const rulesRow = item.type === 'agentSiteRules';
          const noDivider =
            (item.id === 'agentLinkIntercept' && nextId === 'openMethod:agentSiteWhitelist') ||
            (item.id === 'openMethod:agentSiteWhitelist' &&
              nextId === 'openMethod:agentSiteRules') ||
            rulesOpen;
          const rowClassName = `adl-settings-row${noDivider ? ' adl-settings-row--no-divider' : ''}${rulesRow ? ' adl-settings-row--rules' : ''}`;
          return (
            <Fragment key={item.id}>
              <div className={rowClassName} data-settings-anchor={anchorFor(item.groupId, item.id)}>
                <div className="adl-settings-row__label">
                  <span className="adl-settings-row__label-text">
                    {canReset && (
                      <button
                        type="button"
                        className="adl-settings-row__reset adl-settings-row__reset--inline"
                        aria-label={t.settingsResetToDefault}
                        title={t.settingsResetToDefault}
                        disabled={isDefault}
                        onClick={() => handleReset(item, resetValue as SettingValue)}
                      >
                        <IconResetDefaults size={14} decorative />
                      </button>
                    )}
                    <span>{item.label}</span>
                  </span>
                  {item.description && <small>{item.description}</small>}
                  {/* 白名单空态提示放左侧副标题下方（事项 2b），control 列只留操作按钮。
                      蓝色与 DSH 组提示小字同口径（事项 2c）。 */}
                  {item.type === 'allowlist' &&
                    normalizeAgentSiteEntries(item.value).length === 0 && (
                      <small className="adl-settings-allowlist__empty-hint">
                        {t.settingsAgentAllowEmpty}
                      </small>
                    )}
                </div>
                <div className="adl-settings-row__control">
                  {item.type === 'toggle' && (
                    <ToggleControl item={item} onChange={(v) => onChange(item.id, v)} />
                  )}
                  {item.type === 'select' && (
                    <SelectControl
                      item={item}
                      onChange={(v) => onChange(item.id, v)}
                      className={
                        item.id === 'linkOpenMethod' || item.id === 'fileOpenMethod'
                          ? 'adl-settings-dropdown--open-method'
                          : undefined
                      }
                    />
                  )}
                  {item.type === 'input' && (
                    <InputControl item={item} onChange={(v) => onChange(item.id, v)} />
                  )}
                  {item.type === 'password' && (
                    <PasswordControl item={item} onChange={(v) => onChange(item.id, v)} t={t} />
                  )}
                  {item.type === 'readonly' && <InputControl item={item} onChange={() => {}} />}
                  {item.type === 'font' && (
                    <FontControl
                      item={item}
                      cssVar={item.cssVar ?? '--font-sans-custom'}
                      onChange={(v) => onChange(item.id, v)}
                      t={t}
                    />
                  )}
                  {item.type === 'allowlist' && (
                    <AgentAllowlistControl
                      item={item}
                      t={t}
                      onChange={(v) => onChange(item.id, v)}
                    />
                  )}
                  {item.type === 'agentSiteRules' && (
                    <AgentSiteRulesControl
                      item={item}
                      t={t}
                      open={openRulesId === item.id}
                      onToggle={() => {
                        suppressAutoSaveRef.current = false;
                        setOpenRulesId((current) => (current === item.id ? null : item.id));
                      }}
                    />
                  )}
                </div>
              </div>
              {item.type === 'agentSiteRules' && openRulesId === item.id && (
                <AgentSiteRulesPanel
                  item={item}
                  t={t}
                  onChange={onChange}
                  onClose={() => setOpenRulesId(null)}
                  suppressAutoSave={suppressAutoSaveRef}
                />
              )}
            </Fragment>
          );
        })}
      </div>
      <ConfirmDialog
        open={pendingReset !== null}
        title={pendingReset?.title ?? ''}
        message={pendingReset?.message ?? ''}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={confirmReset}
        onCancel={() => setPendingReset(null)}
      />
    </div>
  );
}
