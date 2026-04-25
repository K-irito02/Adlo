import React from "react";
import type { ExecutionSummaryConversationBlock } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../copy";
import { IconCheckCircle, IconAlertTriangle, IconRefreshCw } from "../../icons";

interface ExecutionSummaryProps {
  t: CopyDict;
  block: ExecutionSummaryConversationBlock;
  onViewChanges?: () => void;
}

function statusLabel(t: CopyDict, status: ExecutionSummaryConversationBlock["status"]): string {
  const map: Record<typeof status, keyof CopyDict> = {
    succeeded: "executionSucceeded",
    failed: "executionFailed",
    "rolled-back": "executionRolledBack",
  };
  return t[map[status]] as string;
}

function statusIcon(status: ExecutionSummaryConversationBlock["status"]) {
  switch (status) {
    case "succeeded": return <IconCheckCircle size={16} decorative />;
    case "failed": return <IconAlertTriangle size={16} decorative />;
    case "rolled-back": return <IconRefreshCw size={16} decorative />;
  }
}

function statusChipClass(status: ExecutionSummaryConversationBlock["status"]): string {
  switch (status) {
    case "succeeded": return "adl-chip--success";
    case "failed": return "adl-chip--danger";
    case "rolled-back": return "adl-chip--warning";
  }
}

export function ExecutionSummaryCard({ t, block, onViewChanges }: ExecutionSummaryProps) {
  return (
    <section className="adl-execution-summary">
      <header className="adl-execution-summary__header">
        {statusIcon(block.status)}
        <h4>{t.executionSummaryTitle}</h4>
        <span className={`adl-chip ${statusChipClass(block.status)}`}>
          {statusLabel(t, block.status)}
        </span>
      </header>

      <div className="adl-execution-summary__body">
        {block.filesModified.length > 0 && (
          <div className="adl-execution-summary__section">
            <strong>{t.filesModified}</strong>
            <ul>
              {block.filesModified.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
        )}

        {block.commandsExecuted.length > 0 && (
          <div className="adl-execution-summary__section">
            <strong>{t.commandsExecuted}</strong>
            <ul>
              {block.commandsExecuted.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {(block.validationPassed != null || block.validationFailed != null) && (
          <div className="adl-execution-summary__section">
            <strong>{t.validationResults}</strong>
            <div className="adl-execution-summary__counts">
              {block.validationPassed != null && (
                <span className="adl-chip adl-chip--success adl-chip--xs">
                  {t.passedCount}: {block.validationPassed}
                </span>
              )}
              {block.validationFailed != null && (
                <span className="adl-chip adl-chip--danger adl-chip--xs">
                  {t.failedCount}: {block.validationFailed}
                </span>
              )}
            </div>
          </div>
        )}

        {block.rollbackReason && (
          <div className="adl-execution-summary__section adl-execution-summary__section--warning">
            <strong>{t.rollbackReason}</strong>
            <p>{block.rollbackReason}</p>
          </div>
        )}
      </div>

      {onViewChanges && (
        <footer className="adl-execution-summary__footer">
          <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onViewChanges}>
            {t.viewChanges}
          </button>
        </footer>
      )}
    </section>
  );
}
