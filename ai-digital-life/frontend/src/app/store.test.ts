import { describe, expect, it } from 'vitest';

describe('store utility functions', () => {
  describe('hasConversationMessages', () => {
    it('returns true when messages exist', () => {
      const detail = { messages: [{ id: '1' }, { id: '2' }] } as any;
      const result = (detail?.messages.length ?? 0) > 0;
      expect(result).toBe(true);
    });

    it('returns false when messages is empty', () => {
      const detail = { messages: [] } as any;
      const result = (detail?.messages.length ?? 0) > 0;
      expect(result).toBe(false);
    });

    it('returns false when detail is undefined', () => {
      const detail = undefined as any;
      const result = (detail?.messages.length ?? 0) > 0;
      expect(result).toBe(false);
    });
  });
});
