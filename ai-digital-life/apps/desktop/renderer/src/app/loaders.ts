import type { ConversationDetail, ConversationSessionRecord, TaskCenterSnapshot } from "@ai-digital-life/kernel";

export async function loadTaskCenterState(): Promise<TaskCenterSnapshot | undefined> {
  const result = await window.digitalLife.task.getSnapshot();
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

export async function loadConversationState(sessionId?: string): Promise<{
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  detail?: ConversationDetail;
}> {
  const sessionsResult = await window.digitalLife.conversation.listSessions();
  if (!sessionsResult.ok) {
    throw new Error(sessionsResult.error.message);
  }

  let activeId = sessionId ?? sessionsResult.data[0]?.id;
  if (!activeId) {
    const created = await window.digitalLife.conversation.createSession();
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    activeId = created.data.id;
  }

  const detailResult = activeId ? await window.digitalLife.conversation.getSession(activeId) : undefined;
  if (detailResult && !detailResult.ok) {
    throw new Error(detailResult.error.message);
  }

  return {
    sessions: sessionsResult.data,
    activeSessionId: activeId,
    detail: detailResult?.data
  };
}
