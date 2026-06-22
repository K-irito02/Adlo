import type { ConversationMessageRecord, ConversationSessionRecord } from "@ai-digital-life/kernel";
import { activeWorkspaceScopeId } from "./mock-shared-workspace";

export const sessions: ConversationSessionRecord[] = [
  {
    id: "conversation-mock-1",
    workspaceId: "workspace-mock-1",
    title: "Single Agent Session",
    status: "active",
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    manualUnread: false,
    lastReadAt: Date.now(),
    archivedAt: undefined,
    titleUpdatedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastMessageAt: Date.now()
  }
];

export const messagesBySession = new Map<string, ConversationMessageRecord[]>([
  [
    sessions[0].id,
    []
  ]
]);

export function listScopedSessions(): ConversationSessionRecord[] {
  const scopeId = activeWorkspaceScopeId();
  return sessions.filter((session) => session.workspaceId === scopeId);
}

export function ensureSession(sessionId: string): ConversationSessionRecord {
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }
  return session;
}

export function ensureConversationDetail(sessionId: string): import("@ai-digital-life/kernel").ConversationDetail {
  const session = ensureSession(sessionId);
  return {
    session,
    messages: messagesBySession.get(sessionId) ?? []
  };
}