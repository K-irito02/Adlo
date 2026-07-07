import React from 'react';
import type { AppInfo, ModelGatewayHealthSnapshot } from '@ai-digital-life/kernel';
import { useTCopy } from '../i18n/useTCopy';
import { MODEL_PROVIDER_IDS } from '../utils/constants';
import { MODEL_OPTIONS } from '../utils/constants';
import { IconCheck } from '../icons';
import { TooltipSimple } from '../components/Tooltip';
import { modelHealthLabel, modelHealthTone } from './StatusBar/utils';

interface StatusBarEditorInfoProps {
  appInfo?: AppInfo;
  modelHealth?: ModelGatewayHealthSnapshot;
  activeModelLabel: string;
  activeProviderId: string | undefined;
  activeProviderModelId: string | undefined;
  activeProviderHealthHealthy: boolean | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onRequestClose: () => void;
  onSelectModel: (providerId: string, modelId?: string) => void;
}

const StatusBarEditorInfo = React.memo(function StatusBarEditorInfo({
  appInfo,
  modelHealth,
  activeModelLabel,
  activeProviderId,
  activeProviderModelId,
  activeProviderHealthHealthy,
  isOpen,
  onToggle,
  onRequestClose,
  onSelectModel,
}: StatusBarEditorInfoProps) {
  const { t } = useTCopy();

  return (
    <>
      <span className="adl-statusbar__spacer" />
      <span className="adl-statusbar__sep" aria-hidden="true" />

      <div className="adl-statusbar__slot">
        <button
          type="button"
          className="adl-statusbar__item adl-statusbar__model-trigger"
          onClick={onToggle}
          aria-haspopup="menu"
        >
          <span>{t.modelLabel}</span>
          <TooltipSimple content={activeModelLabel} placement="top">
            <strong className="adl-statusbar__model-name">{activeModelLabel}</strong>
          </TooltipSimple>
          <TooltipSimple content={modelHealthLabel(t, activeProviderHealthHealthy)} placement="top">
            <span
              className={`adl-statusbar__model-dot adl-statusbar__model-dot--${modelHealthTone(activeProviderHealthHealthy)}`}
              aria-label={modelHealthLabel(t, activeProviderHealthHealthy)}
              role="img"
            />
          </TooltipSimple>
        </button>
        {isOpen ? (
          <div className="adl-statusbar__menu adl-statusbar__menu--model" role="menu">
            {MODEL_PROVIDER_IDS.flatMap((providerId) => {
              const health = modelHealth?.providers.find(
                (provider) => provider.providerId === providerId
              );
              const preference = appInfo?.config.modelPreferences.providers[providerId];
              if (!preference) {
                return [];
              }

              const configured = { id: preference.modelId, label: preference.modelId };
              const baseOptions = MODEL_OPTIONS[providerId] ?? [];
              const options = baseOptions.some((option) => option.id === configured.id)
                ? baseOptions
                : [configured, ...baseOptions];

              return options.map((option) => {
                const isActive =
                  providerId === activeProviderId && option.id === activeProviderModelId;
                return (
                  <button
                    key={`${providerId}:${option.id}`}
                    type="button"
                    role="menuitem"
                    className={`adl-statusbar__menu-option${isActive ? ' is-active' : ''}`}
                    onClick={() => {
                      onSelectModel(providerId, option.id);
                      onRequestClose();
                    }}
                  >
                    <span className="adl-statusbar__menu-option-main">{option.label}</span>
                    {isActive ? (
                      <IconCheck size={14} decorative />
                    ) : (
                      <span
                        className={`adl-statusbar__model-option-dot adl-statusbar__model-option-dot--${modelHealthTone(health?.healthy)}`}
                        aria-label={modelHealthLabel(t, health?.healthy)}
                        role="img"
                      />
                    )}
                  </button>
                );
              });
            })}
          </div>
        ) : null}
      </div>
    </>
  );
});

export { StatusBarEditorInfo };
export type { StatusBarEditorInfoProps };
