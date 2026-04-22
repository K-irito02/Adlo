import {
  type ConversationDetail,
  type ConversationMessageRecord,
  type ConversationRole,
  type ReorderSessionsInput,
  type ConversationSessionRecord,
  createId
} from "@ai-digital-life/kernel";
import type { StateRepository } from "@ai-digital-life/storage";

export class ConversationService {
  constructor(private readonly stateRepository: StateRepository) {}

  async createSession(workspaceId: string, title: string): Promise<ConversationSessionRecord> {
    const now = Date.now();
    const session: ConversationSessionRecord = {
      id: createId("conversation"),
      workspaceId,
      title,
      status: "active",
      isPinned: false,
      pinnedOrder: 0,
      unpinnedOrder: (await this.stateRepository.listConversationSessions(workspaceId, { includeArchived: true })).filter(
        (candidate) => !candidate.isPinned
      ).length,
      manualUnread: false,
      lastReadAt: now,
      archivedAt: undefined,
      titleUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now
    };
    await this.stateRepository.upsertConversationSession(session);
    return session;
  }

  async listSessions(workspaceId: string): Promise<ConversationSessionRecord[]> {
    return this.stateRepository.listConversationSessions(workspaceId);
  }

  async renameSession(sessionId: string, title: string): Promise<ConversationSessionRecord> {
    return this.stateRepository.renameConversationSession(sessionId, title);
  }

  async pinSession(sessionId: string): Promise<ConversationSessionRecord> {
    return this.stateRepository.pinConversationSession(sessionId);
  }

  async unpinSession(sessionId: string): Promise<ConversationSessionRecord> {
    return this.stateRepository.unpinConversationSession(sessionId);
  }

  async reorderSessions(input: ReorderSessionsInput): Promise<ConversationSessionRecord[]> {
    return this.stateRepository.reorderConversationSessions(input);
  }

  async markSessionRead(sessionId: string, readAt?: number): Promise<ConversationSessionRecord> {
    return this.stateRepository.markConversationSessionRead(sessionId, readAt);
  }

  async markSessionUnread(sessionId: string): Promise<ConversationSessionRecord> {
    return this.stateRepository.markConversationSessionUnread(sessionId);
  }

  async archiveSession(sessionId: string): Promise<ConversationSessionRecord> {
    return this.stateRepository.archiveConversationSession(sessionId);
  }

  async archiveAllSessionsInWorkspace(workspaceId: string): Promise<ConversationSessionRecord[]> {
    return this.stateRepository.archiveConversationSessionsInWorkspace(workspaceId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.stateRepository.deleteConversationSession(sessionId);
  }

  async getSession(sessionId: string): Promise<ConversationDetail | undefined> {
    return this.stateRepository.getConversationDetail(sessionId);
  }

  async clearMessages(sessionId: string): Promise<void> {
    await this.stateRepository.clearConversationMessages(sessionId);
  }

  async addMessage(input: {
    sessionId: string;
    role: ConversationRole;
    content: string;
    blocks?: ConversationMessageRecord["blocks"];
    runId?: string;
  }): Promise<ConversationMessageRecord> {
    const message: ConversationMessageRecord = {
      id: createId("message"),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      blocks: input.blocks ?? [],
      runId: input.runId,
      createdAt: Date.now()
    };
    await this.stateRepository.insertConversationMessage(message);
    return message;
  }
}
