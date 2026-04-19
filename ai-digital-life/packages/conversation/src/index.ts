import {
  type ConversationDetail,
  type ConversationMessageRecord,
  type ConversationRole,
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

  async getSession(sessionId: string): Promise<ConversationDetail | undefined> {
    return this.stateRepository.getConversationDetail(sessionId);
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
