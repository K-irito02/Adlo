import { useState } from 'react';
import type { ModelTokenUsage } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { IconChevronDown, IconChevronRight } from '../../icons';

interface TokenUsageProps {
  t: CopyDict;
  usage?: ModelTokenUsage;
}

export function TokenUsage({ t, usage }: TokenUsageProps) {
  const [expanded, setExpanded] = useState(false);

  if (!usage) {
    return null;
  }
  const total = usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);

  return (
    <div className="adl-token-usage">
      <button
        type="button"
        className="adl-token-usage__toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <IconChevronDown size={12} decorative />
        ) : (
          <IconChevronRight size={12} decorative />
        )}
        <span className="adl-token-usage__total">
          {t.tokenUsageTotal}: {total.toLocaleString()}
        </span>
      </button>
      {expanded && (
        <div className="adl-token-usage__detail">
          <span>
            {t.tokenUsageInput}: {(usage.promptTokens ?? 0).toLocaleString()}
          </span>
          <span>
            {t.tokenUsageOutput}: {(usage.completionTokens ?? 0).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
