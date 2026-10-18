import { useMemo } from 'react';
import type { SettingItem } from '../../../kernel/types';
import type { CopyDict } from '../../i18n';
import { parseWhitelistLines } from '@shared/originWhitelist';

interface OriginListControlProps {
  item: SettingItem;
  t: CopyDict;
  onChange: (value: string) => void;
}

export function OriginListControl({ item, t, onChange }: OriginListControlProps) {
  const invalid = useMemo(
    () => parseWhitelistLines(String(item.value ?? '')).invalid,
    [item.value],
  );
  return (
    <div className="adl-settings-origin-list">
      <textarea
        className="adl-settings-input adl-settings-origin-list__input"
        value={String(item.value ?? '')}
        placeholder={t.settingsAgentWhitelistPlaceholder}
        spellCheck={false}
        disabled={item.disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {invalid.length > 0 && (
        <p className="adl-settings-origin-list__invalid" role="alert">
          {t.settingsAgentWhitelistInvalid}
        </p>
      )}
    </div>
  );
}
