import { useMemo } from 'react';
import type { PartRecord } from '../../../kernel/types-part';
import type { SessionPartState } from './partStoreTypes';
import { collectSessionFileParts } from './partFileUtils';
import { PartDiffPanel } from './PartDiffPanel';
import { useTCopy } from '../../i18n/useTCopy';

/**
 * S3 Task 5: session-side context panel — the session's associated `file`
 * parts (deduped by url, reusing `collectSessionFileParts`) plus the `patch`
 * parts rendered as `PartDiffPanel` file lists.
 *
 * Placement decision (S3 Task 5 report): rendered in the CenterPane part-path
 * below `PartConversation` rather than inside the right panel's tool-view
 * machine — the `RightPanel` `ActiveToolPanel` is a memoized, tool-id-driven
 * switch over lazy-loaded FilesPanel/ChangesPanel/BrowserPanel/etc.; forcing a
 * "session" view in would mean a `ToolId` union change + ToolSwitcher/badges
 * rework. The CenterPane part-path already owns `partState` (usePartStream)
 * and renders the sibling `SessionFileTabs`, so the session context view is a
 * natural companion there.
 *
 * The root carries `adl-part-scope` (SessionDocks precedent) so the internal
 * `PartDiffPanel` resolves its own `--adl-part-*` local vars; this panel's own
 * `.adl-part-side-panel*` rules consume only global tokens (T2 CSS-fix rule).
 * Returns null when the session has neither file nor patch parts so part-less
 * / text-only sessions render no context section.
 */
export function SessionSidePanel({ state }: { state: SessionPartState }) {
  const { t } = useTCopy();
  const files = useMemo(
    () => collectSessionFileParts(state.partsByMessage),
    [state.partsByMessage],
  );
  const patches = useMemo(() => {
    const out: PartRecord[] = [];
    for (const parts of state.partsByMessage.values()) {
      for (const part of parts) {
        if (part.type === 'patch' && part.data.type === 'patch') {
          out.push(part);
        }
      }
    }
    return out;
  }, [state.partsByMessage]);

  if (files.length === 0 && patches.length === 0) {
    return null;
  }

  return (
    <div className="adl-part-scope adl-part-side-panel" aria-label={t.partSessionSidePanel}>
      <h3 className="adl-part-side-panel__title">{t.partSessionFiles}</h3>
      <ul className="adl-part-side-panel__files">
        {files.map((f) => (
          <li key={f.url}>{f.filename ?? f.url}</li>
        ))}
      </ul>
      <h3 className="adl-part-side-panel__title">{t.partSessionPatches}</h3>
      {patches.map((p) => (
        <PartDiffPanel key={p.id} part={p} />
      ))}
    </div>
  );
}
