import { useEffect, useState } from 'react';
import type { SettingItem } from '@shared/ipc';
import type { CopyDict } from '../../i18n';
import { SettingsSelect } from './SettingsSelect';

const UI_FONT_OPTIONS = [
  'Inter',
  'system-ui',
  'PingFang SC',
  'Microsoft YaHei',
  'Noto Sans SC',
  'Segoe UI',
  'Helvetica Neue',
  'Arial',
];

const MONO_FONT_OPTIONS = [
  'JetBrains Mono',
  'Cascadia Code',
  'Consolas',
  'Menlo',
  'Fira Code',
  'Source Code Pro',
  'Noto Sans Mono',
  'monospace',
];

interface FontControlProps {
  item: SettingItem;
  cssVar: '--font-sans-custom' | '--font-mono-custom';
  onChange: (v: string) => void;
  t: CopyDict;
}

export function FontControl({ item, cssVar, onChange, t }: FontControlProps) {
  const committed = String(item.value);
  // 悬停值只驱动左侧预览，不写 documentElement（避免整个应用字体跳动）。
  const [hover, setHover] = useState<string | null>(null);

  // 已确认值落盘到 documentElement（双端一致：纯前端 CSS 变量即时生效 + 后端持久化经 onChange）。
  useEffect(() => {
    if (committed) {
      document.documentElement.style.setProperty(cssVar, committed);
    } else {
      document.documentElement.style.removeProperty(cssVar);
    }
  }, [committed, cssVar]);

  const baseOptions = cssVar === '--font-sans-custom' ? UI_FONT_OPTIONS : MONO_FONT_OPTIONS;
  const options = [
    { value: '', label: t.settingsFontDefault },
    ...baseOptions.map((f) => ({ value: f, label: f })),
  ];
  if (committed && !options.some((o) => o.value === committed)) {
    options.push({ value: committed, label: committed });
  }

  const previewFont = hover ?? committed;

  return (
    <div className="adl-settings-font adl-settings-font--row">
      <div
        className="adl-settings-font__preview"
        style={previewFont ? { fontFamily: previewFont } : undefined}
      >
        {t.settingsFontPreview}
      </div>
      <SettingsSelect
        value={committed}
        options={options}
        onChange={(v) => {
          setHover(null);
          onChange(v);
        }}
        onHoverOption={(v) => setHover(v)}
        label={item.label}
        optionStyle={(v) => (v ? { fontFamily: v } : undefined)}
      />
    </div>
  );
}
