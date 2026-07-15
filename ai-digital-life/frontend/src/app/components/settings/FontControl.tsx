import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import type { SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';

const PLACEHOLDER_BY_CSS_VAR: Record<string, string> = {
  '--font-sans-custom': 'Inter',
  '--font-mono-custom': 'JetBrains Mono',
};

interface FontControlProps {
  item: SettingItem;
  cssVar: '--font-sans-custom' | '--font-mono-custom';
  onChange: (v: string) => void;
  t: CopyDict;
}

export function FontControl({ item, cssVar, onChange, t }: FontControlProps) {
  const [localValue, setLocalValue] = useState(String(item.value));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(String(item.value));
    const currentValue = String(item.value);
    if (currentValue) {
      document.documentElement.style.setProperty(cssVar, currentValue);
    } else {
      document.documentElement.style.removeProperty(cssVar);
    }
  }, [item.value, cssVar]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    if (next) {
      document.documentElement.style.setProperty(cssVar, next);
    } else {
      document.documentElement.style.removeProperty(cssVar);
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => onChange(next), 500);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="adl-settings-font">
      <input
        type="text"
        className="adl-settings-font__input"
        value={localValue}
        placeholder={PLACEHOLDER_BY_CSS_VAR[cssVar] ?? 'Inter'}
        onChange={handleChange}
      />
      <div className="adl-settings-font__preview">{t.settingsFontPreview}</div>
    </div>
  );
}
