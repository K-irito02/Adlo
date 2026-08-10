import { AskCard } from './AskCard';
import { TurnSummary } from './TurnSummary';
import { mapPartTurnStatus } from './PartConversation';
import { normalizeQuestions } from './partTimelineUtils';
import type { SessionPartState } from './partStoreTypes';
import { useTCopy } from '../../i18n/useTCopy';

export function SessionDocks({
  state,
  onReply,
}: {
  state: SessionPartState;
  onReply: (requestID: string, answers: string[]) => void;
}) {
  const { t } = useTCopy();
  return (
    <div className="adl-part-scope adl-part-docks" aria-label={t.partDocks}>
      {state.questions.map((q) => (
        <AskCard
          key={q.requestID}
          requestID={q.requestID}
          questions={normalizeQuestions(q.questions)}
          onReply={onReply}
        />
      ))}
      <TurnSummary status={mapPartTurnStatus(state.status)} />
    </div>
  );
}
