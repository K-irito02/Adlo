// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ThemeController,
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
    it("hydrates root with light theme", () => {
      const controller = new ThemeController({
        root,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      controller.hydrate();
      expect(root.dataset.theme).toBe("light");
    });

    it("respects prefers-color-scheme on first paint when in system mode", () => {
      const controller = new ThemeController({
        root,
        systemDarkQuery: makeMediaQuery(true) as unknown as MediaQueryList
      });

      controller.hydrate();
      expect(root.dataset.theme).toBe("dark");
    });

    it("applies explicit light/dark choices and notifies subscribers", () => {
      const controller = new ThemeController({
        root,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      const listener = vi.fn();
      controller.subscribe(listener);
      controller.setTheme({ mode: "dark", resolvedTheme: "dark" });

      expect(root.dataset.theme).toBe("dark");
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ resolvedTheme: "dark", themeMode: "dark" }));
    });

    it("dispose detaches matchMedia listener", () => {
      const mediaQuery = makeMediaQuery(false);
      const controller = new ThemeController({
        root,
        systemDarkQuery: mediaQuery as unknown as MediaQueryList
      });

      expect(mediaQuery.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
      controller.dispose();
      expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });
  });
});
