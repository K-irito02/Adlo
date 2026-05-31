import React, { useState } from "react";
import type { ApprovalRequestSummary, RiskLevel } from "@ai-digital-life/kernel";
import type { CopyDict } from "../../i18n";
import { IconChevronDown, IconChevronRight, IconShield } from "../../icons";

interface ApprovalCardProps {
  t: CopyDict;
  approval: ApprovalRequestSummary;
  decided?: { decision: "approved" | "rejected"; decidedAt: number };
  onDecide: (id: string, decision: "approved" | "rejected") => void;
}

function riskBarClass(level: RiskLevel): string {
  switch (level) {
    case "high": return "adl-approval-card__bar--high";
    case "medium": return "adl-approval-card__bar--medium";
    default: return "adl-approval-card__bar--low";
  }
}

function riskLabel(t: CopyDict, level: RiskLevel): string {
  const map: Record<RiskLevel, keyof CopyDict> = {
    low: "riskLow",
    medium: "riskMedium",
    high: "riskHigh",
  };
  return t[map[level]] as string;
}

export function ApprovalCard({ t, approval, decided, onDecide }: ApprovalCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const isDecided = !!decided;

  return (
    <article className={`adl-approval-card${isDecided ? " adl-approval-card--decided" : ""}`} role="alert">
      <div className={`adl-approval-card__bar ${riskBarClass(approval.riskLevel)}`} aria-hidden="true" />
      <div className="adl-approval-card__content">
        <header className="adl-approval-card__header">
          <IconShield size={16} decorative />
          <span className="adl-approval-card__title">{approval.title}</span>
          <span className={`adl-chip adl-chip--xs adl-chip--${approval.riskLevel === "high" ? "danger" : approval.riskLevel === "medium" ? "warning" : "muted"}`}>
            {riskLabel(t, approval.riskLevel)}
          </span>
        </header>

        <p className="adl-approval-card__desc">{approval.description}</p>

        {approval.impact?.length ? (
          <div className="adl-approval-card__impact">
            <strong>{t.approvalImpact}</strong>
            <ul>
              {approval.impact.map((item, idx) => <li key={idx}>{item}</li>)}
            </ul>
          </div>
        ) : null}

        {approval.description && (
          <div className="adl-approval-card__detail-toggle">
            <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => setDetailOpen((v) => !v)}>
              {detailOpen ? <IconChevronDown size={12} decorative /> : <IconChevronRight size={12} decorative />}
              {detailOpen ? t.approvalHideDetail : t.approvalViewDetail}
            </button>
            {detailOpen && (
              <pre className="adl-approval-card__detail-content">{approval.description}</pre>
            )}
          </div>
        )}

        {isDecided ? (
          <div className="adl-approval-card__decided">
            <span className={`adl-chip ${decided.decision === "approved" ? "adl-chip--success" : "adl-chip--danger"}`}>
              {decided.decision === "approved" ? t.approvalApproved : t.approvalRejected}
            </span>
            <time>{new Date(decided.decidedAt).toLocaleTimeString()}</time>
          </div>
        ) : (
          <div className="adl-approval-card__actions">
            <button
              type="button"
              className="adl-btn adl-btn--primary adl-btn--sm"
              onClick={() => onDecide(approval.id, "approved")}
            >
              {t.approve}
            </button>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--sm"
              onClick={() => onDecide(approval.id, "rejected")}
            >
              {t.rejectApproval}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
