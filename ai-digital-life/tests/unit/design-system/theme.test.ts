// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COLOR_SCHEMES,
  ThemeController,
  isColorScheme,
  isThemeMode,
  resolveThemeMode
} from "../../../apps/desktop/renderer/src/design-system/theme";

interface MockMediaQueryList {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function makeMediaQuery(matches = false): MockMediaQueryList {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
}

class MemoryStorage {
  private map = new Map<string, string>();
  getItem = (key: string): string | null => this.map.get(key) ?? null;
  setItem = (key: string, value: string): void => {
    this.map.set(key, value);
  };
}

describe("design-system/theme", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  describe("guards", () => {
    it("validates color scheme strings", () => {
      expect(isColorScheme("scheme-1")).toBe(true);
      expect(isColorScheme("scheme-9")).toBe(false);
      expect(isColorScheme(null)).toBe(false);
    });

    it("validates theme modes", () => {
      expect(isThemeMode("light")).toBe(true);
      expect(isThemeMode("dark")).toBe(true);
      expect(isThemeMode("system")).toBe(true);
      expect(isThemeMode("auto")).toBe(false);
    });

    it("resolves system mode by prefersDark flag", () => {
      expect(resolveThemeMode("system", true)).toBe("dark");
      expect(resolveThemeMode("system", false)).toBe("light");
      expect(resolveThemeMode("light", true)).toBe("light");
      expect(resolveThemeMode("dark", false)).toBe("dark");
    });
  });

  describe("ThemeController", () => {
    it("hydrates root with default scheme + light theme", () => {
      const controller = new ThemeController({
        root,
        storage: new MemoryStorage(),
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      controller.hydrate();
      expect(root.dataset.colorScheme).toBe("scheme-2");
      expect(root.dataset.theme).toBe("light");
    });

    it("respects prefers-color-scheme on first paint when in system mode", () => {
      const controller = new ThemeController({
        root,
        storage: new MemoryStorage(),
        systemDarkQuery: makeMediaQuery(true) as unknown as MediaQueryList
      });

      controller.hydrate();
      expect(root.dataset.theme).toBe("dark");
    });

    it("applies explicit light/dark choices and notifies subscribers", () => {
      const controller = new ThemeController({
        root,
        storage: new MemoryStorage(),
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      const listener = vi.fn();
      controller.subscribe(listener);
      controller.setTheme({ mode: "dark", resolvedTheme: "dark" });

      expect(root.dataset.theme).toBe("dark");
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ resolvedTheme: "dark", themeMode: "dark" }));
    });

    it("persists color scheme selection to storage and applies to root", () => {
      const storage = new MemoryStorage();
      const controller = new ThemeController({
        root,
        storage,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });
      controller.hydrate();

      controller.setColorScheme("scheme-4");
      expect(root.dataset.colorScheme).toBe("scheme-4");
      expect(storage.getItem("ai-digital-life:color-scheme")).toBe("scheme-4");
    });

    it("ignores unknown color schemes", () => {
      const controller = new ThemeController({
        root,
        storage: new MemoryStorage(),
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });
      controller.hydrate();

      // @ts-expect-error - intentionally invalid value
      controller.setColorScheme("scheme-x");
      expect(root.dataset.colorScheme).toBe("scheme-2");
    });

    it("recovers a previously persisted color scheme", () => {
      const storage = new MemoryStorage();
      storage.setItem("ai-digital-life:color-scheme", "scheme-3");

      const controller = new ThemeController({
        root,
        storage,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });
      controller.hydrate();
      expect(root.dataset.colorScheme).toBe("scheme-3");
    });

    it("exposes all five color schemes", () => {
      expect(COLOR_SCHEMES).toHaveLength(5);
    });

    it("dispose detaches matchMedia listener", () => {
      const mediaQuery = makeMediaQuery(false);
      const controller = new ThemeController({
        root,
        storage: new MemoryStorage(),
        systemDarkQuery: mediaQuery as unknown as MediaQueryList
      });

      expect(mediaQuery.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
      controller.dispose();
      expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("survives storage errors", () => {
      const failingStorage: Pick<Storage, "getItem" | "setItem"> = {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        }
      };

      const controller = new ThemeController({
        root,
        storage: failingStorage,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      controller.hydrate();
      expect(root.dataset.colorScheme).toBe("scheme-2");

      expect(() => controller.setColorScheme("scheme-5")).not.toThrow();
      expect(root.dataset.colorScheme).toBe("scheme-5");
    });
  });
});
