import React, { useState } from "react";
import type { CopyDict } from "../../i18n";
import { IconChevronDown, IconChevronUp, IconClose, IconFolder } from "../../icons";
import type { ContextChip } from "../../stores/types";

interface ContextSummaryBarProps {
  t: CopyDict;
  workspaceName?: string;
  chips: ContextChip[];
  tokenEstimate?: number;
  onRemoveChip: (id: string) => void;
}

export function ContextSummaryBar({ t, workspaceName, chips, tokenEstimate, onRemoveChip }: ContextSummaryBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!workspaceName && chips.length === 0) return null;

  const fileCount = chips.filter((c) => c.kind === "file").length;

  return (
    <div className="adl-context-bar">
      <button
        type="button"
        className="adl-context-bar__summary"
        onClick={() => setExpanded((v) => !v)}
      >
        {workspaceName && (
          <span className="adl-context-bar__workspace">
            <IconFolder size={12} decorative />
            {workspaceName}
          </span>
        )}
        {fileCount > 0 && (
          <span className="adl-context-bar__files">
            {fileCount} {t.contextSummaryFiles}
          </span>
        )}
        {tokenEstimate != null && (
          <span className="adl-context-bar__tokens">
            ~{tokenEstimate.toLocaleString()} {t.contextSummaryTokens}
          </span>
        )}
        {expanded ? <IconChevronUp size={14} decorative /> : <IconChevronDown size={14} decorative />}
      </button>

      {expanded && chips.length > 0 && (
        <ul className="adl-context-bar__detail">
          {chips.map((chip) => (
            <li key={chip.id} className="adl-context-bar__item">
              <span className={`adl-chip adl-chip--xs adl-chip--${chip.kind}`}>{chip.kind}</span>
              <span className="adl-context-bar__item-label">{chip.label}</span>
              <button
                type="button"
                className="adl-context-bar__remove"
                onClick={() => onRemoveChip(chip.id)}
                aria-label={t.contextRemoveItem}
              >
                <IconClose size={12} decorative />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
