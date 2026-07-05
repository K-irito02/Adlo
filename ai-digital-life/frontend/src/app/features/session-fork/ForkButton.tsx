import { useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { ConversationSessionRecord } from '@ai-digital-life/kernel';

export function ForkButton({
  parentSession,
  forkMessageId,
  existingForkCount,
}: {
  parentSession: ConversationSessionRecord;
  forkMessageId: string;
  existingForkCount: number;
}) {
  const { t } = useTCopy();
  const [forking, setForking] = useState(false);
  const forkSession = useAppStore((s) => s.forkSession);

  const handleFork = async () => {
    setForking(true);
    await forkSession(parentSession, forkMessageId, existingForkCount);
    setForking(false);
  };

  return (
    <button
      type="button"
      className="adl-fork-button"
      onClick={handleFork}
      disabled={forking}
      aria-label={t.sessionFork}
    >
      {forking ? t.sessionForking : t.sessionFork}
    </button>
  );
}
