import type { ConversationBridge } from "../shared/ipc";
import type { ConversationDetail, IpcResult } from "@ai-digital-life/kernel";
import {
  activeRun,
  activeWorkspaceScopeId,
  createSendResult,
  listScopedSessions,
  messagesBySession,
  sessions,
} from "./mock-shared";

export const mockConversation: ConversationBridge = {
  createSession: async (title?: string, workspaceId?: string) => {
    const session: import("@ai-digital-life/kernel").ConversationSessionRecord = {
      id: `conversation-${Date.now()}`,
      workspaceId: workspaceId || activeWorkspaceScopeId(),
      title: title || "Single Agent Session",
      status: "active",
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: sessions.filter((candidate) => !candidate.isPinned).length,
      manualUnread: false,
      lastReadAt: Date.now(),
      archivedAt: undefined,
      titleUpdatedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastMessageAt: Date.now()
    };
    sessions.unshift(session);
    messagesBySession.set(session.id, []);
    return { ok: true, data: session };
  },
  listSessions: async () => ({ ok: true, data: listScopedSessions() }),
  getSession: async (sessionId: string): Promise<IpcResult<ConversationDetail | undefined>> => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return { ok: true, data: undefined };
    return {
      ok: true,
      data: {
        session,
        messages: messagesBySession.get(sessionId) ?? []
      }
    };
  },
  renameSession: async ({ sessionId, title }) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)!;
    session.title = title;
    session.titleUpdatedAt = Date.now();
    return { ok: true, data: session };
  },
  pinSession: async (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)!;
    session.isPinned = true;
    return { ok: true, data: session };
  },
  unpinSession: async (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)!;
    session.isPinned = false;
    return { ok: true, data: session };
  },
  reorderSessions: async () => ({ ok: true, data: sessions }),
  markSessionRead: async ({ sessionId }) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)!;
    session.manualUnread = false;
    session.lastReadAt = Date.now();
    return { ok: true, data: session };
  },
  markSessionUnread: async (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)!;
    session.manualUnread = true;
    return { ok: true, data: session };
  },
  archiveSession: async (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)!;
    session.status = "archived";
    session.archivedAt = Date.now();
    return { ok: true, data: session };
  },
  archiveAllInWorkspace: async () => {
    for (const session of listScopedSessions()) {
      session.status = "archived";
      session.archivedAt = Date.now();
    }
    return { ok: true, data: listScopedSessions() };
  },
  deleteSession: async (sessionId: string) => {
    const index = sessions.findIndex((candidate) => candidate.id === sessionId);
    if (index >= 0) {
      sessions.splice(index, 1);
      messagesBySession.delete(sessionId);
    }
    return { ok: true, data: true };
  },
  sendMessage: async ({ sessionId, content, providerId, modelId }) => {
    const result = createSendResult(sessionId, content);
    return {
      ok: true,
      data: {
        session: result.session,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        runDetail: activeRun!,
        patchSet: result.patchSet
      }
    };
  },
  cancelMessage: async () => ({ ok: true, data: activeRun })
};