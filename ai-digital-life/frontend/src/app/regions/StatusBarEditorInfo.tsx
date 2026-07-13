import React from 'react';
import type { AppInfo, ModelGatewayHealthSnapshot } from '@ai-digital-life/kernel';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/slicedStore';
import { useTCopy } from '../i18n/useTCopy';
import { CustomScrollArea } from '../features/file-tree/CustomScrollArea';
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
}

const StatusBarEditorInfo = React.memo(function StatusBarEditorInfo({
  modelHealth,
  activeModelLabel,
  activeProviderId,
  activeProviderModelId,
  activeProviderHealthHealthy,
  isOpen,
  onToggle,
  onRequestClose,
}: StatusBarEditorInfoProps) {
  const { t } = useTCopy();
  const { providers, selectModel } = useAppStore(
    useShallow((s) => ({
      providers: s.providers,
      selectModel: s.selectModel,
    }))
  );

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
          <div
            className="adl-model-picker__dropdown adl-model-picker__dropdown--statusbar"
            role="menu"
          >
            {providers.length === 0 ? (
              <div className="adl-model-picker__empty">{t.providerNoProviders}</div>
            ) : (
              <CustomScrollArea
                shellClassName="adl-model-picker__scroll-shell"
                scrollClassName="adl-model-picker__scroll"
                scrollbarClassName="adl-model-picker__scrollbar"
                thumbClassName="adl-model-picker__scrollbar-thumb"
              >
                {providers.map((p) => (
                  <div key={p.id} className="adl-model-picker__group">
                    <div className="adl-model-picker__group-header">{p.name}</div>
                    {p.models.length === 0 ? (
                      <div className="adl-model-picker__no-models">{t.modelUnavailable}</div>
                    ) : (
                      p.models.map((m) => {
                        const isActive =
                          activeProviderId === p.id && activeProviderModelId === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            role="menuitem"
                            className={`adl-model-picker__option${isActive ? ' is-active' : ''}`}
                            aria-selected={isActive}
                            onClick={() => {
                              selectModel(p.id, m.id);
                              onRequestClose();
                            }}
                          >
                            <span className="adl-model-picker__option-name">{m.name}</span>
                            {isActive ? (
                              <IconCheck size={14} decorative />
                            ) : (
                              <span
                                className={`adl-model-picker__option-dot adl-model-picker__option-dot--${modelHealthTone(
                                  modelHealth?.providers.find((h) => h.providerId === p.id)?.healthy
                                )}`}
                                aria-label={modelHealthLabel(
                                  t,
                                  modelHealth?.providers.find((h) => h.providerId === p.id)?.healthy
                                )}
                                role="img"
                              />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                ))}
              </CustomScrollArea>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
});

export { StatusBarEditorInfo };
export type { StatusBarEditorInfoProps };
