import React from "react";
import type { SettingItem } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import { IconEye, IconEyeOff } from "../../icons";

interface SettingsControlsProps {
  t: CopyDict;
  items: SettingItem[];
  onChange: (id: string, value: string | boolean | number) => void;
  searchQuery?: string;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
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
      className={`adl-settings-toggle${checked ? " is-on" : ""}`}
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
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function InputControl({ item, onChange }: { item: SettingItem; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      className="adl-settings-input"
      value={String(item.value)}
      readOnly={item.type === "readonly"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function PasswordControl({ item, onChange }: { item: SettingItem; onChange: (v: string) => void }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="adl-settings-password">
      <input
        type={visible ? "text" : "password"}
        className="adl-settings-input"
        value={String(item.value)}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="adl-icon-btn adl-icon-btn--xs" onClick={() => setVisible((v) => !v)} aria-label="Toggle visibility">
        {visible ? <IconEyeOff size={14} decorative /> : <IconEye size={14} decorative />}
      </button>
    </div>
  );
}

export function SettingsControls({ t, items, onChange, searchQuery }: SettingsControlsProps) {
  if (items.length === 0) {
    return <p className="adl-empty-hint">{t.noResults}</p>;
  }

  return (
    <div className="adl-settings-controls">
      {items.map((item) => (
        <div key={item.id} className="adl-settings-row">
          <div className="adl-settings-row__label">
            <span>{highlightMatch(item.label, searchQuery ?? "")}</span>
            {item.description && <small>{highlightMatch(item.description, searchQuery ?? "")}</small>}
          </div>
          <div className="adl-settings-row__control">
            {item.type === "toggle" && <ToggleControl item={item} onChange={(v) => onChange(item.id, v)} />}
            {item.type === "select" && <SelectControl item={item} onChange={(v) => onChange(item.id, v)} />}
            {item.type === "input" && <InputControl item={item} onChange={(v) => onChange(item.id, v)} />}
            {item.type === "password" && <PasswordControl item={item} onChange={(v) => onChange(item.id, v)} />}
            {item.type === "readonly" && <InputControl item={item} onChange={() => {}} />}
          </div>
        </div>
      ))}
    </div>
  );
}
