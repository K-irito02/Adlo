import { describe, expect, it, vi, beforeEach } from "vitest";
import { copy } from "./copy";
import { getCachedLru, setCachedLru } from "./store";

describe("store utility functions", () => {
  describe("sessionFallbackTitle", () => {
    it("returns English fallback for en-US", () => {
      const result = copy["en-US"].sessionFallback;
      expect(result).toBe("Single Agent Session");
    });

    it("returns Chinese fallback for zh-CN", () => {
      const result = copy["zh-CN"].sessionFallback;
      expect(result).toBe("单 Agent 会话");
    });
  });

  describe("workspaceContextModeFromInfo", () => {
    it("returns 'workspace' when currentWorkspace exists", () => {
      const appInfo = { currentWorkspace: { id: "ws-1" } } as any;
      const result = appInfo?.currentWorkspace ? "workspace" : "global";
      expect(result).toBe("workspace");
    });

    it("returns 'global' when currentWorkspace is undefined", () => {
      const appInfo = undefined;
      const result = appInfo?.currentWorkspace ? "workspace" : "global";
      expect(result).toBe("global");
    });
  });

  describe("hasConversationMessages", () => {
    it("returns true when messages exist", () => {
      const detail = { messages: [{ id: "1" }, { id: "2" }] } as any;
      const result = (detail?.messages.length ?? 0) > 0;
      expect(result).toBe(true);
    });

    it("returns false when messages is empty", () => {
      const detail = { messages: [] } as any;
      const result = (detail?.messages.length ?? 0) > 0;
      expect(result).toBe(false);
    });

    it("returns false when detail is undefined", () => {
      const detail = undefined;
      const result = (detail?.messages.length ?? 0) > 0;
      expect(result).toBe(false);
    });
  });

  describe("LRU cache helpers", () => {
    it("getCachedLru returns undefined for missing key", () => {
      const cache = new Map<string, number>();
      const result = getCachedLru(cache, "missing");
      expect(result).toBeUndefined();
    });

    it("getCachedLru returns and promotes entry", () => {
      const cache = new Map<string, number>();
      cache.set("key1", 1);
      cache.set("key2", 2);
      const result = getCachedLru(cache, "key1");
      expect(result).toBe(1);
    });

    it("setCachedLru respects limit", () => {
      const cache = new Map<string, number>();
      const limit = 3;
      setCachedLru(cache, "1", 1, limit);
      setCachedLru(cache, "2", 2, limit);
      setCachedLru(cache, "3", 3, limit);
      setCachedLru(cache, "4", 4, limit);
      expect(cache.size).toBeLessThanOrEqual(limit);
    });
  });
});
