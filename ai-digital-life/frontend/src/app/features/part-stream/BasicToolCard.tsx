import { useMemo, useState } from 'react';
import type { PartComponent } from './PartRenderer';
import { useTCopy } from '../../i18n/useTCopy';
import { ToolErrorCard } from './ToolErrorCard';

export const BasicToolCard: PartComponent = ({ part, defaultOpen = false }) => {
  const { t } = useTCopy();
  const [open, setOpen] = useState(defaultOpen);
  const tool = part.data.type === 'tool' ? part.data : undefined;
  const state = tool?.state;
  const status = state?.status ?? 'pending';
  const toolName = tool?.tool ?? '';
  const title =
    state?.status === 'running' || state?.status === 'completed'
      ? (state.title ?? toolName)
      : toolName;
  const input = state?.input;

  const label = useMemo(() => {
    if (status === 'running') {
      return t.partToolRunning;
    }
    if (status === 'completed') {
      return t.partToolCompleted;
    }
    if (status === 'error') {
      return t.partToolError;
    }
    return t.partToolPending;
  }, [status, t]);

  return (
    <details
      className={`adl-part-tool adl-part-tool--${status}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="adl-part-tool__summary">
        <span className="adl-part-tool__title">{title || label}</span>
        <span className="adl-part-tool__status">{label}</span>
      </summary>
      <div className="adl-part-tool__body">
        {state?.status === 'error' ? <ToolErrorCard error={state.error} /> : null}
        {input !== undefined && status !== 'completed' ? (
          <pre className="adl-part-tool__input">
            {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
          </pre>
        ) : null}
        {state?.status === 'completed' && state.output ? (
          <pre className="adl-part-tool__output">{state.output}</pre>
        ) : null}
      </div>
    </details>
  );
};
