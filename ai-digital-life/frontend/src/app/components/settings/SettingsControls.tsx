import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';
import type { SettingItem } from '@shared/ipc';
import { useTCopy } from '../../i18n/useTCopy';
import type { CopyDict } from '../../i18n';
import { IconEye, IconEyeOff, IconRefreshCw } from '../../icons';
import { FontControl } from './FontControl';
import { getDefaultForSetting } from '../../../shared/defaultPreferences';

interface SettingsControlsProps {
  items: SettingItem[];
  onChange: (id: string, value: string | boolean | number) => void;
  searchQuery?: string;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) {
    return text;
  }
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, idx)}
      <mark className="adl-settings-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ToggleControl({ item, onChange }: { item: SettingItem; onChange: (v: boolean) => void }) {
  const checked = !!item.value;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`adl-settings-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="adl-settings-toggle__track">
        <span className="adl-settings-toggle__thumb" />
      </span>
    </button>
  );
}

function SelectControl({ item, onChange }: { item: SettingItem; onChange: (v: string) => void }) {
  return (
    <select
      className="adl-settings-select"
      value={String(item.value)}
      onChange={(e) => onChange(e.target.value)}
    >
      {item.options?.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
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

export function SettingsControls({ items, onChange, searchQuery }: SettingsControlsProps) {
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
        {items.map((item) => {
          const defaultValue = getDefaultForSetting(item.id);
          const canReset = item.type !== 'readonly' && defaultValue !== undefined;
          return (
            <div key={item.id} className="adl-settings-row">
              <div className="adl-settings-row__label">
                <span>{highlightMatch(item.label, searchQuery ?? '')}</span>
                {item.description && (
                  <small>{highlightMatch(item.description, searchQuery ?? '')}</small>
                )}
              </div>
              <div className="adl-settings-row__control">
                {item.type === 'toggle' && (
                  <ToggleControl item={item} onChange={(v) => onChange(item.id, v)} />
                )}
                {item.type === 'select' && (
                  <SelectControl item={item} onChange={(v) => onChange(item.id, v)} />
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
              </div>
              {canReset && (
                <button
                  type="button"
                  className="adl-settings-row__reset"
                  aria-label={t.settingsResetToDefault}
                  title={t.settingsResetToDefault}
                  onClick={() => onChange(item.id, defaultValue as string | boolean | number)}
                >
                  <IconRefreshCw size={14} decorative />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
