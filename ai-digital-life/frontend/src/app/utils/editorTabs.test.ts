import { describe, expect, it } from "vitest";
import { createEditorTab, mapPatchToEditorTab } from "./editorTabs";

describe("editorTabs", () => {
  describe("createEditorTab", () => {
    it("creates tab with Unix-style path", () => {
      const tab = createEditorTab("src/components/Button.tsx");
      expect(tab.id).toBe("src/components/Button.tsx");
      expect(tab.path).toBe("src/components/Button.tsx");
      expect(tab.title).toBe("Button.tsx");
    });

    it("creates tab with Windows-style path", () => {
      const tab = createEditorTab("src\\components\\Button.tsx");
      expect(tab.id).toBe("src\\components\\Button.tsx");
      expect(tab.path).toBe("src\\components\\Button.tsx");
      expect(tab.title).toBe("Button.tsx");
    });

    it("handles path with trailing slash", () => {
      const tab = createEditorTab("src/components/Button.tsx/");
      expect(tab.title).toBe("Button.tsx");
    });

    it("handles single segment path", () => {
      const tab = createEditorTab("Button.tsx");
      expect(tab.title).toBe("Button.tsx");
      expect(tab.path).toBe("Button.tsx");
    });

    it("handles nested path", () => {
      const tab = createEditorTab("a/b/c/d/test.rs");
      expect(tab.title).toBe("test.rs");
    });

    it("handles path with multiple slashes", () => {
      const tab = createEditorTab("src//components///Button.tsx");
      expect(tab.title).toBe("Button.tsx");
    });

    it("handles path with dots in name", () => {
      const tab = createEditorTab("src/components/My.Component.tsx");
      expect(tab.title).toBe("My.Component.tsx");
    });
  });

  describe("mapPatchToEditorTab", () => {
    it("maps file patch to editor tab", () => {
      const patch = { relativePath: "src/App.tsx" } as any;
      const tab = mapPatchToEditorTab(patch);
      expect(tab.id).toBe("src/App.tsx");
      expect(tab.title).toBe("App.tsx");
    });

    it("maps nested file patch", () => {
      const patch = { relativePath: "frontend/src/components/Header.tsx" } as any;
      const tab = mapPatchToEditorTab(patch);
      expect(tab.title).toBe("Header.tsx");
    });
  });
});
