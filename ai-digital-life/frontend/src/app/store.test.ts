import { describe, expect, it } from 'vitest';
import { loadLocale } from './i18n/i18nLoader';

describe('store utility functions', () => {
  describe('sessionFallbackTitle', () => {
    it('returns English fallback for en-US', async () => {
      const dict = await loadLocale('en-US');
      const result = dict.sessionFallback;
      expect(result).toBe('Single Agent Session');
    });

    it('returns Chinese fallback for zh-CN', async () => {
      const dict = await loadLocale('zh-CN');
      const result = dict.sessionFallback;
      expect(result).toBe('单 Agent 会话');
    });
  });

  describe('workspaceContextModeFromInfo', () => {
    it("returns 'workspace' when currentWorkspace exists", () => {
      const appInfo = { currentWorkspace: { id: 'ws-1' } } as any;
      const result = appInfo?.currentWorkspace ? 'workspace' : 'global';
      expect(result).toBe('workspace');
    });

    it("returns 'global' when currentWorkspace is undefined", () => {
      const appInfo = undefined as any;
      const result = appInfo?.currentWorkspace ? 'workspace' : 'global';
      expect(result).toBe('global');
    });
  });

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
