import React, { useEffect, useRef, useState } from "react";
import type { ModelGatewayHealthSnapshot } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import { IconChevronDown } from "../../icons";
import { MODEL_PROVIDER_IDS } from "../../constants";
import { TooltipSimple } from "../Tooltip";

interface ModelSelectorProps {
  t: CopyDict;
  currentModelId?: string;
  modelHealth?: ModelGatewayHealthSnapshot;
  onSelect: (providerId: string) => void;
}

export function ModelSelector({ t, currentModelId, modelHealth, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="adl-model-selector">
      <TooltipSimple content={t.modelSelector} placement="top">
        <button
          type="button"
          className={`adl-model-selector__trigger${open ? " is-open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="adl-model-selector__label">{currentModelId ?? "—"}</span>
          <IconChevronDown size={12} decorative />
        </button>
      </TooltipSimple>
      {open && (
        <ul className="adl-model-selector__menu" role="listbox">
          {MODEL_PROVIDER_IDS.map((id) => {
            const health = modelHealth?.providers.find((p) => p.providerId === id);
            return (
              <li
                key={id}
                role="option"
                aria-selected={id === currentModelId}
                className={`adl-model-selector__option${id === currentModelId ? " is-active" : ""}`}
                onClick={() => {
                  onSelect(id);
                  setOpen(false);
                }}
              >
                <span>{id}</span>
                <span className={`adl-model-selector__status adl-model-selector__status--${health?.healthy ? "online" : "offline"}`} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
