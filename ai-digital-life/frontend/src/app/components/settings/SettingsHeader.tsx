import type { ReactNode } from 'react';

interface SettingsHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SettingsHeader({ title, description, action }: SettingsHeaderProps) {
  return (
    <div className="adl-settings-header adl-settings-header--editorial">
      <div className="adl-settings-header__text">
        <h3 className="adl-settings-header__title adl-settings-title--serif">{title}</h3>
        {description && <p className="adl-settings-header__desc">{description}</p>}
      </div>
      {action && <div className="adl-settings-header__action">{action}</div>}
    </div>
  );
}
