import type { ConversationDetail, ConversationSessionRecord } from '@ai-digital-life/kernel';

export async function loadConversationState(sessionId?: string): Promise<{
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  detail?: ConversationDetail;
}> {
  const sessionsResult = await window.digitalLife.conversation.listSessions();
  if (!sessionsResult.ok) {
    throw new Error(sessionsResult.error.message);
  }

  const activeId = sessionId ?? sessionsResult.data[0]?.id;

  const detailResult = activeId
    ? await window.digitalLife.conversation.getSession(activeId)
    : undefined;
  if (detailResult && !detailResult.ok) {
    throw new Error(detailResult.error.message);
  }

  return {
    sessions: sessionsResult.data,
    activeSessionId: activeId,
    detail: detailResult?.data,
  };
}
