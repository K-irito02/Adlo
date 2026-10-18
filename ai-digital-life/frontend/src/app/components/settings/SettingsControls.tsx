import React, { useState, useEffect, useRef, useMemo, type ChangeEvent } from 'react';
import type { SettingItem, SettingValue } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import type { CopyDict } from '../../i18n';
import { IconEye, IconEyeOff, IconResetDefaults } from '../../icons';
import { FontControl } from './FontControl';
import { SettingsSelect } from './SettingsSelect';
import { AgentAllowlistControl } from './AgentAllowlistControl';
import { getDefaultForSetting } from '../../../shared/defaultPreferences';
import { isStringArrayEqual } from './settingsGroups';
import { anchorFor } from './settingsSearchIndex';

interface SettingsControlsProps {
  items: SettingItem[];
  onChange: (id: string, value: SettingValue) => void;
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

function ToggleControl({ item, onChange }: { item: SettingItem; onChange: (v: boolean) => void }) {
  const checked = !!item.value;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={item.disabled}
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
  if (items.length === 0) {
    return (
      <div className="adl-settings-card adl-settings-controls-wrap">
        <p className="adl-empty-hint">{t.noResults}</p>
      </div>
    );
  }

  return (
    <div className="adl-settings-card adl-settings-controls-wrap">
      <div className="adl-settings-controls">
        {items.map((item, index) => {
          const defaultValue = getDefaultForSetting(item.id);
          const canReset = item.type !== 'readonly' && defaultValue !== undefined;
          const isDefault = canReset && isDefaultValue(item.value, defaultValue);
          // 拦截开关联动的白名单与拦截行视为同一组：白名单存在时去掉拦截行的底部分隔线。
          const nextId = items[index + 1]?.id;
          const rowClassName =
            item.id === 'agentLinkIntercept' && nextId === 'openMethod:agentSiteWhitelist'
              ? 'adl-settings-row adl-settings-row--no-divider'
              : 'adl-settings-row';
          return (
            <div
              key={item.id}
              className={rowClassName}
              data-settings-anchor={anchorFor(item.groupId, item.id)}
            >
              <div className="adl-settings-row__label">
                <span className="adl-settings-row__label-text">
                  {canReset && (
                    <button
                      type="button"
                      className="adl-settings-row__reset adl-settings-row__reset--inline"
                      aria-label={t.settingsResetToDefault}
                      title={t.settingsResetToDefault}
                      disabled={isDefault}
                      onClick={() => onChange(item.id, defaultValue as SettingValue)}
                    >
                      <IconResetDefaults size={14} decorative />
                    </button>
                  )}
                  <span>{item.label}</span>
                </span>
                {item.description && <small>{item.description}</small>}
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
                  <AgentAllowlistControl item={item} t={t} onChange={(v) => onChange(item.id, v)} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
