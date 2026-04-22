// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useUiStore persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it("persists active tool, width, and file tree expansion", async () => {
    const { useUiStore } = await import("../../apps/desktop/renderer/src/app/ui-store");
    const state = useUiStore.getState();

    state.setActiveTool("terminal");
    state.setRightPanelWidth(700);
    state.expandFileTreePathChain("packages/kernel/src/index.ts");

    vi.resetModules();
    const { useUiStore: nextStore } = await import("../../apps/desktop/renderer/src/app/ui-store");
    const next = nextStore.getState();

    expect(next.activeTool).toBe("terminal");
    expect(next.rightPanelWidth).toBe(700);
    expect(next.expandedFileTreePaths["packages"]).toBe(true);
    expect(next.expandedFileTreePaths["packages/kernel"]).toBe(true);
  });

  it("persists browser and terminal local shells", async () => {
    const { useUiStore } = await import("../../apps/desktop/renderer/src/app/ui-store");
    const state = useUiStore.getState();

    state.browserOpenTab({ title: "Preview", url: "http://localhost:5173/" });
    state.browserToggleBookmark({ title: "Preview", url: "http://localhost:5173/" });
    state.terminalCreateTab("bash");
    state.terminalSetLayout("vertical");

    vi.resetModules();
    const { useUiStore: nextStore } = await import("../../apps/desktop/renderer/src/app/ui-store");
    const next = nextStore.getState();

    expect(next.browserTabs.some((tab) => tab.url === "http://localhost:5173/")).toBe(true);
    expect(next.browserBookmarks.some((bookmark) => bookmark.url === "http://localhost:5173/")).toBe(true);
    expect(next.terminalTabs.some((tab) => tab.profile === "bash")).toBe(true);
    expect(next.terminalLayout).toBe("vertical");
  });
});
