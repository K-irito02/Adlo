import { useTCopy } from '../../i18n/useTCopy';

export function AskCard({
  requestID,
  questions,
  onReply,
}: {
  requestID: string;
  questions: { text?: string; [key: string]: unknown }[];
  onReply: (requestID: string, answers: string[]) => void;
}) {
  const { t } = useTCopy();
  return (
    <div className="adl-part-ask" role="group" aria-label={t.partAskCard}>
      <p className="adl-part-ask__prompt">{t.partAskPrompt}</p>
      <div className="adl-part-ask__options">
        {questions.map((q, i) => {
          const text = typeof q?.text === 'string' ? q.text : JSON.stringify(q);
          return (
            <button
              key={i}
              type="button"
              className="adl-part-ask__option"
              onClick={() => onReply(requestID, [text])}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
