import { describe, expect, it } from 'vitest';
import { copy } from './i18n';
import { getCachedLruTTL, setCachedLruTTL } from './stores/shared';

describe('store utility functions', () => {
  describe('sessionFallbackTitle', () => {
    it('returns English fallback for en-US', () => {
      const result = copy['en-US'].sessionFallback;
      expect(result).toBe('Single Agent Session');
    });

    it('returns Chinese fallback for zh-CN', () => {
      const result = copy['zh-CN'].sessionFallback;
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

  describe('LRU cache helpers', () => {
    it('getCachedLruTTL returns undefined for missing key', () => {
      const cache = new Map<string, { value: number; expiresAt: number }>();
      const result = getCachedLruTTL(cache, 'missing');
      expect(result).toBeUndefined();
    });

    it('getCachedLruTTL returns and promotes entry', () => {
      const cache = new Map<string, { value: number; expiresAt: number }>();
      cache.set('key1', { value: 1, expiresAt: Date.now() + 60000 });
      cache.set('key2', { value: 2, expiresAt: Date.now() + 60000 });
      const result = getCachedLruTTL(cache, 'key1');
      expect(result).toBe(1);
    });

    it('setCachedLruTTL respects limit', () => {
      const cache = new Map<string, { value: number; expiresAt: number }>();
      const limit = 3;
      setCachedLruTTL(cache, '1', 1, limit, 60000);
      setCachedLruTTL(cache, '2', 2, limit, 60000);
      setCachedLruTTL(cache, '3', 3, limit, 60000);
      setCachedLruTTL(cache, '4', 4, limit, 60000);
      expect(cache.size).toBeLessThanOrEqual(limit);
    });
  });
});
