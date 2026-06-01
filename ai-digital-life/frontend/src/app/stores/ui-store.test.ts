import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

describe("ui-store tree expansion helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {
      localStorage: new MemoryStorage(),
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("crypto", {
      randomUUID: () => "test-id",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the same object when a file path chain is already expanded", async () => {
    const { expandTreePathChainInState } = await import("./ui-store");
    const current = {
      src: true,
      "src/app": true,
      "src/app/regions": true,
      "src/app/regions/right-panel": true,
    };

    const next = expandTreePathChainInState(current, "src/app/regions/right-panel/fileTree.tsx");
    expect(next).toBe(current);
  });

  it("returns the same object when setting an expanded path to its current state", async () => {
    const { setTreePathExpandedInState } = await import("./ui-store");
    const current = {
      src: true,
    };

    const next = setTreePathExpandedInState(current, "src", true);
    expect(next).toBe(current);
  });
});
