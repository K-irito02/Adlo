import React, { useState } from "react";
import type { CopyDict } from "../../i18n";
import { IconRefreshCw } from "../../icons";

export interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  isCurrent: boolean;
}

interface CheckpointTimelineProps {
  t: CopyDict;
  checkpoints: Checkpoint[];
  onRestore: (checkpointId: string) => void;
}

export function CheckpointTimeline({ t, checkpoints, onRestore }: CheckpointTimelineProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (checkpoints.length === 0) return null;

  return (
    <div className="adl-checkpoint-timeline">
      <h4 className="adl-checkpoint-timeline__title">{t.checkpointTitle}</h4>
      <ol className="adl-checkpoint-timeline__list">
        {checkpoints.map((cp) => (
          <li key={cp.id} className={`adl-checkpoint-timeline__item${cp.isCurrent ? " is-current" : ""}`}>
            <span className="adl-checkpoint-timeline__dot" aria-hidden="true" />
            <div className="adl-checkpoint-timeline__content">
              <span className="adl-checkpoint-timeline__label">{cp.label}</span>
              <time className="adl-checkpoint-timeline__time">
                {new Date(cp.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </time>
              {cp.isCurrent ? (
                <span className="adl-chip adl-chip--xs adl-chip--info">{t.checkpointCurrent}</span>
              ) : confirmId === cp.id ? (
                <span className="adl-checkpoint-timeline__confirm">
                  <span>{t.checkpointConfirm}</span>
                  <button type="button" className="adl-btn adl-btn--danger adl-btn--xs" onClick={() => { onRestore(cp.id); setConfirmId(null); }}>
                    <IconRefreshCw size={12} decorative />
                    {t.checkpointRestore}
                  </button>
                  <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => setConfirmId(null)}>
                    {t.checkpointCancel}
                  </button>
                </span>
              ) : (
                <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => setConfirmId(cp.id)}>
                  {t.checkpointRestore}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
