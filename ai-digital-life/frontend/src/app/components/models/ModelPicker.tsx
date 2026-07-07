import React, { useState, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { TooltipSimple } from '../Tooltip';
import { IconChevronDown } from '../../icons';
import { useTCopy } from '../../i18n/useTCopy';

export function ModelPicker() {
  const { t } = useTCopy();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { providers, selectedProviderId, selectedModelId, selectModel } = useAppStore(
    useShallow((s) => ({
      providers: s.providers,
      selectedProviderId: s.selectedProviderId,
      selectedModelId: s.selectedModelId,
      selectModel: s.selectModel,
    }))
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const label =
    selectedProvider && selectedModelId
      ? `${selectedProvider.name} / ${selectedModelId}`
      : t.modelSelector;

  return (
    <div className="adl-model-picker" ref={ref}>
      <TooltipSimple content={t.modelSelector} placement="top">
        <button
          type="button"
          className="adl-model-picker__trigger"
          onClick={() => setOpen(!open)}
          aria-label={t.modelSelector}
          aria-expanded={open}
        >
          <span className="adl-model-picker__label">{label}</span>
          <IconChevronDown size={12} decorative />
        </button>
      </TooltipSimple>
      {open && (
        <div className="adl-model-picker__dropdown" role="listbox">
          {providers.length === 0 && (
            <div className="adl-model-picker__empty">{t.providerNoProviders}</div>
          )}
          {providers.map((p) => (
            <div key={p.id} className="adl-model-picker__group">
              <div className="adl-model-picker__group-header">{p.name}</div>
              {p.models.length === 0 ? (
                <div className="adl-model-picker__no-models">{t.modelUnavailable}</div>
              ) : (
                p.models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`adl-model-picker__option ${selectedProviderId === p.id && selectedModelId === m.id ? 'is-active' : ''}`}
                    role="option"
                    aria-selected={selectedProviderId === p.id && selectedModelId === m.id}
                    onClick={() => {
                      selectModel(p.id, m.id);
                      setOpen(false);
                    }}
                  >
                    {m.name}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
