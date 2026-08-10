import type { MessageRecord, PartRecord } from '../../../kernel/types-part';

export interface QuestionEntry {
  requestID: string;
  questions: unknown[];
  tool?: unknown;
}

export interface SessionPartState {
  messages: Map<string, MessageRecord>;
  partsByMessage: Map<string, PartRecord[]>;
  status: 'idle' | 'active' | 'busy' | 'error' | 'cancelled';
  questions: QuestionEntry[];
}

export type PartState = Record<string, SessionPartState>;

export type SseWireEvent =
  | { type: 'message.created'; sessionID: string; info: { id: string } & Record<string, unknown> }
  | { type: 'message.updated'; sessionID: string; info: { id: string } & Record<string, unknown> }
  | {
      type: 'message.part.updated';
      sessionID: string;
      messageID: string;
      partID: string;
      part: Record<string, unknown>;
    }
  | {
      type: 'message.part.delta';
      sessionID: string;
      messageID: string;
      partID: string;
      field: string;
      delta: string;
    }
  | { type: 'session.status'; sessionID: string; status: string }
  | {
      type: 'question.asked';
      sessionID: string;
      requestID: string;
      questions: unknown[];
      tool?: unknown;
    }
  | { type: 'question.replied'; sessionID: string; requestID: string; answers: unknown[] };
