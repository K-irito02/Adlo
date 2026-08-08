import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDemoSessions,
  getDemoSessionDetail,
  resetDemoConversation,
} from './demo-conversation';
import { DEMO_SESSION_IDS } from './demo-constants';

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
});
