import React, { useEffect, useRef } from 'react';
import type { CopyDict } from '../../i18n';
import type { ChatMode, ContextChip } from '../../stores/types';
import {
  IconBookOpen,
  IconBug,
  IconClipboardList,
  IconCpu,
  IconDatabase,
  IconFileText,
  IconImagePlus,
  IconLink,
  IconMessageQuestion,
  IconPlug,
  IconSparkles,
} from '../../icons';

export function ContextBuilderPopover({
  t,
  open,
  onClose,
  chatMode,
  onSelectMode,
  onAddChip,
}: {
  t: CopyDict;
  open: boolean;
  onClose: () => void;
  chatMode: ChatMode;
  onSelectMode: (mode: ChatMode) => void;
  onAddChip: (chip: ContextChip) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const uid = () => `ctx-${Math.random().toString(36).slice(2, 10)}`;

  return (
    <div
      ref={ref}
      className="adl-context-popover"
      role="dialog"
      aria-label={t.contextBuilderHeading}
    >
      <header>{t.contextBuilderHeading}</header>
      <section>
        <h5>{t.contextGroupModes}</h5>
        <button
          type="button"
          className={`adl-context-item${chatMode === 'plan' ? ' is-active' : ''}`}
          onClick={() => {
            onSelectMode('plan');
            onClose();
          }}
        >
          <IconClipboardList size={14} decorative />
          <span>{t.chatModePlan}</span>
        </button>
        <button
          type="button"
          className={`adl-context-item${chatMode === 'debug' ? ' is-active' : ''}`}
          onClick={() => {
            onSelectMode('debug');
            onClose();
          }}
        >
          <IconBug size={14} decorative />
          <span>{t.chatModeDebug}</span>
        </button>
        <button
          type="button"
          className={`adl-context-item${chatMode === 'ask' ? ' is-active' : ''}`}
          onClick={() => {
            onSelectMode('ask');
            onClose();
          }}
        >
          <IconMessageQuestion size={14} decorative />
          <span>{t.chatModeAsk}</span>
        </button>
      </section>
      <section>
        <h5>{t.contextGroupCapabilities}</h5>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'model', label: t.contextAddModel });
            onClose();
          }}
        >
          <IconCpu size={14} decorative />
          <span>{t.contextAddModel}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'skill', label: t.contextAddSkill });
            onClose();
          }}
        >
          <IconSparkles size={14} decorative />
          <span>{t.contextAddSkill}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'mcp', label: t.contextAddMcp });
            onClose();
          }}
        >
          <IconPlug size={14} decorative />
          <span>{t.contextAddMcp}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'file', label: t.contextAddImage });
            onClose();
          }}
        >
          <IconImagePlus size={14} decorative />
          <span>{t.contextAddImage}</span>
        </button>
      </section>
      <section>
        <h5>{t.contextGroupReferences}</h5>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'file', label: t.contextAddFile });
            onClose();
          }}
        >
          <IconFileText size={14} decorative />
          <span>{t.contextAddFile}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'doc', label: t.contextAddDoc });
            onClose();
          }}
        >
          <IconBookOpen size={14} decorative />
          <span>{t.contextAddDoc}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'url', label: t.contextAddUrl });
            onClose();
          }}
        >
          <IconLink size={14} decorative />
          <span>{t.contextAddUrl}</span>
        </button>
        <button
          type="button"
          className="adl-context-item"
          onClick={() => {
            onAddChip({ id: uid(), kind: 'codebase', label: t.contextAddCodebase });
            onClose();
          }}
        >
          <IconDatabase size={14} decorative />
          <span>{t.contextAddCodebase}</span>
        </button>
      </section>
    </div>
  );
}
