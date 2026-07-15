import { useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { ConversationSessionRecord } from '@shared/ipc';

export function ForkButton({
  parentSession,
  forkMessageId,
}: {
  parentSession: ConversationSessionRecord;
  forkMessageId: string;
}) {
  const { t } = useTCopy();
  const [forking, setForking] = useState(false);
  const forkSession = useAppStore((s) => s.forkSession);

  const handleFork = async () => {
    setForking(true);
    await forkSession(parentSession, forkMessageId);
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
