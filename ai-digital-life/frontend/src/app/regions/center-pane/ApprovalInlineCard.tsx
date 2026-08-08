import { IconMessageQuestion } from '../../icons';
import type { ApprovalRequestSummary } from '@ai-digital-life/kernel';
import { useTCopy } from '../../i18n/useTCopy';

export interface ApprovalInlineCardProps {
  approval: ApprovalRequestSummary;
  onDecide: (id: string, decision: 'approved' | 'rejected') => void;
  readOnly?: boolean;
}

export function ApprovalInlineCard({
  approval,
  onDecide,
  readOnly = false,
}: ApprovalInlineCardProps) {
  const { t } = useTCopy();
  return (
    <article className="adl-inline-approval" role="alert">
      <header>
        <IconMessageQuestion size={16} decorative />
        <span className="adl-inline-approval__title">{approval.title}</span>
        <span className="adl-chip adl-chip--warning">{approval.riskLevel}</span>
      </header>
      <p>{approval.description}</p>
      {approval.impact?.length ? (
        <ul>
          {approval.impact.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      ) : null}
      <div className="adl-inline-approval__actions">
        <button
          type="button"
          className="adl-btn adl-btn--primary adl-btn--sm"
          onClick={() => onDecide(approval.id, 'approved')}
          disabled={readOnly}
        >
          {t.approve}
        </button>
        <button
          type="button"
          className="adl-btn adl-btn--ghost adl-btn--sm"
          onClick={() => onDecide(approval.id, 'rejected')}
          disabled={readOnly}
        >
          {t.rejectApproval}
        </button>
      </div>
    </article>
  );
}
