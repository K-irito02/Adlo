import { describe, expect, it, vi, beforeEach } from "vitest";

describe("copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("copyToClipboard", () => {
    it("returns success when clipboard write succeeds", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const { copyToClipboard } = await import("./copy");
      const result = await copyToClipboard("test content");

      expect(result.ok).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith("test content");
    });

    it("returns error when clipboard write fails", async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error("Clipboard unavailable"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const { copyToClipboard } = await import("./copy");
      const result = await copyToClipboard("test content");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Failed to copy");
      }
    });
  });

  describe("copyMultiple", () => {
    it("copies multiple items sequentially", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const { copyMultiple } = await import("./copy");
      const result = await copyMultiple(["line 1", "line 2", "line 3"]);

      expect(result.ok).toBe(true);
      expect(writeTextMock).toHaveBeenCalledTimes(3);
      expect(writeTextMock).toHaveBeenNthCalledWith(1, "line 1");
      expect(writeTextMock).toHaveBeenNthCalledWith(2, "line 2");
      expect(writeTextMock).toHaveBeenNthCalledWith(3, "line 3");
    });

    it("returns error when one copy fails", async () => {
      const writeTextMock = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Failed"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const { copyMultiple } = await import("./copy");
      const result = await copyMultiple(["line 1", "line 2"]);

      expect(result.ok).toBe(false);
    });
  });
});
