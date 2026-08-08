import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendDemoUserMessage,
  buildDemoSendResult,
  getDemoRunDetail,
  getDemoSessions,
  getDemoSessionDetail,
  resetDemoConversation,
} from './demo-conversation';
import { DEMO_SESSION_IDS } from './demo-constants';
import { DEMO_RUN_IDS } from './demo-run-activity';

const ALL_BLOCK_TYPES = [
  'markdown',
  'plan',
  'tool-call',
  'approval',
  'patch-summary',
  'validation-result',
  'final-summary',
  'execution-step',
  'execution-summary',
  'command-output',
] as const;

describe('demo-conversation', () => {
  beforeEach(() => {
    resetDemoConversation();
  });

  it('provides three demo sessions', () => {
    expect(getDemoSessions().map((s) => s.id).sort()).toEqual(
      Object.values(DEMO_SESSION_IDS).sort(),
    );
  });

  it('covers every conversation block type across all messages', () => {
    const seen = new Set<string>();
    for (const sessionId of Object.values(DEMO_SESSION_IDS)) {
      const detail = getDemoSessionDetail(sessionId);
      for (const message of detail?.messages ?? []) {
        for (const block of message.blocks) {
          seen.add(block.type);
        }
      }
    }
    for (const type of ALL_BLOCK_TYPES) {
      expect(seen.has(type)).toBe(true);
    }
  });

  it('assigns a runId to every assistant message', () => {
    for (const sessionId of Object.values(DEMO_SESSION_IDS)) {
      const detail = getDemoSessionDetail(sessionId);
      for (const message of detail?.messages ?? []) {
        if (message.role === 'assistant') {
          expect(message.runId).toBeTruthy();
        }
      }
    }
  });

  it('returns a patch-set reference on the complete session', () => {
    const detail = getDemoSessionDetail(DEMO_SESSION_IDS.complete);
    const hasPatchSummary = (detail?.messages ?? []).some((m) =>
      m.blocks.some((b) => b.type === 'patch-summary'),
    );
    expect(hasPatchSummary).toBe(true);
  });

  it('returns undefined for an unknown session', () => {
    expect(getDemoSessionDetail('nope')).toBeUndefined();
  });

  it('appends a user message with role user', () => {
    const sessionId = DEMO_SESSION_IDS.complete;
    const before = getDemoSessionDetail(sessionId)!.messages.length;
    appendDemoUserMessage(sessionId, '追加的用户消息');
    const detail = getDemoSessionDetail(sessionId)!;
    expect(detail.messages.length).toBe(before + 1);
    const appended = detail.messages[detail.messages.length - 1];
    expect(appended.role).toBe('user');
    expect(appended.content).toBe('追加的用户消息');
  });

  it('restores the original message count after reset', () => {
    const sessionId = DEMO_SESSION_IDS.complete;
    const original = getDemoSessionDetail(sessionId)!.messages.map((m) => m.id);
    appendDemoUserMessage(sessionId, '应被重置清除');
    expect(getDemoSessionDetail(sessionId)!.messages.length).toBe(original.length + 1);
    resetDemoConversation();
    const after = getDemoSessionDetail(sessionId)!.messages;
    expect(after.map((m) => m.id)).toEqual(original);
  });

  it('returns a run detail for a known run and undefined for an unknown run', () => {
    const detail = getDemoRunDetail(DEMO_RUN_IDS.complete);
    expect(detail?.run.id).toBe(DEMO_RUN_IDS.complete);
    expect(getDemoRunDetail('run-demo-unknown')).toBeUndefined();
  });

  it('registers the run produced by buildDemoSendResult', () => {
    const result = buildDemoSendResult(DEMO_SESSION_IDS.tools, '发送演示消息');
    expect(getDemoRunDetail(result.runDetail.run.id)?.run.id).toBe(result.runDetail.run.id);
  });
});
