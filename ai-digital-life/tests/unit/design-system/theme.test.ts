// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ThemeController,
  isThemeMode,
  resolveThemeMode
} from "../../../apps/desktop/renderer/src/design-system/theme";
import fs from "node:fs";
import path from "node:path";

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

  describe("theme switching transition regression", () => {
    it("toggles data-theme between light and dark without errors", () => {
      const controller = new ThemeController({
        root,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      controller.hydrate();
      expect(root.dataset.theme).toBe("light");

      controller.setTheme({ mode: "dark", resolvedTheme: "dark" });
      expect(root.dataset.theme).toBe("dark");

      controller.setTheme({ mode: "light", resolvedTheme: "light" });
      expect(root.dataset.theme).toBe("light");
    });

    it("notifies subscribers on every theme change", () => {
      const controller = new ThemeController({
        root,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      const listener = vi.fn();
      controller.subscribe(listener);

      controller.setTheme({ mode: "dark", resolvedTheme: "dark" });
      controller.setTheme({ mode: "light", resolvedTheme: "light" });
      controller.setTheme({ mode: "dark", resolvedTheme: "dark" });

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ resolvedTheme: "dark" }));
      expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ resolvedTheme: "light" }));
      expect(listener).toHaveBeenNthCalledWith(3, expect.objectContaining({ resolvedTheme: "dark" }));
    });

    it("preserves theme state after rapid consecutive switches", () => {
      const controller = new ThemeController({
        root,
        systemDarkQuery: makeMediaQuery(false) as unknown as MediaQueryList
      });

      for (let i = 0; i < 20; i++) {
        const theme = i % 2 === 0 ? "dark" : "light";
        controller.setTheme({ mode: theme, resolvedTheme: theme });
      }

      expect(root.dataset.theme).toBe("light");
      expect(controller.getState().resolvedTheme).toBe("light");
    });
  });
});

describe("design-system/theme CSS structure", () => {
  const stylesDir = path.resolve(
    __dirname,
    "../../../apps/desktop/renderer/src/styles"
  );
  const themesCss = fs.readFileSync(path.join(stylesDir, "themes.css"), "utf-8");
  const tokensCss = fs.readFileSync(path.join(stylesDir, "tokens.css"), "utf-8");

  function extractVariables(css: string, selector: RegExp): Set<string> {
    const blockMatch = css.match(selector);
    if (!blockMatch) return new Set();
    const varRegex = /--([a-z0-9-]+)\s*:/g;
    const vars = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = varRegex.exec(blockMatch[0])) !== null) {
      vars.add(`--${match[1]}`);
    }
    return vars;
  }

  it("light and dark themes define the same CSS variable set", () => {
    const lightVars = extractVariables(
      themesCss,
      /:root,\s*\[data-theme="light"\]\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/
    );
    const darkVars = extractVariables(
      themesCss,
      /\[data-theme="dark"\]\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/
    );

    const lightOnly = new Set([...lightVars].filter((v) => !darkVars.has(v)));
    const darkOnly = new Set([...darkVars].filter((v) => !lightVars.has(v)));

    expect(lightOnly.size).toBe(0);
    expect(darkOnly.size).toBe(0);
  });

  it("both themes define required core color variables", () => {
    const requiredVars = [
      "--bg",
      "--bg-secondary",
      "--bg-card",
      "--bg-input",
      "--bg-hover",
      "--bg-active",
      "--surface",
      "--surface-elevated",
      "--surface-raised",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--text-hint",
      "--text-inverse",
      "--text-on-accent",
      "--border",
      "--border-subtle",
      "--border-default",
      "--border-strong",
      "--accent",
      "--accent-soft",
      "--accent-strong",
      "--accent-subtle",
      "--danger",
      "--danger-soft",
      "--danger-subtle",
      "--warning",
      "--warning-soft",
      "--warning-subtle",
      "--success",
      "--success-soft",
      "--success-subtle",
      "--info",
      "--info-soft",
      "--info-subtle",
      "--code-bg",
      "--focus-ring"
    ];

    const lightVars = extractVariables(
      themesCss,
      /:root,\s*\[data-theme="light"\]\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/
    );
    const darkVars = extractVariables(
      themesCss,
      /\[data-theme="dark"\]\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/
    );

    for (const varName of requiredVars) {
      expect(lightVars.has(varName)).toBe(true);
      expect(darkVars.has(varName)).toBe(true);
    }
  });

  it("tokens.css defines --theme-transition variable", () => {
    expect(tokensCss).toContain("--theme-transition");
  });

  it("themes.css uses no hardcoded hex colors in selector lists", () => {
    const transitionBlock = themesCss.match(
      /\/\*\s*-+ Theme transition support[\s\S]*?-+\s*\*\//m
    );
    if (!transitionBlock) return;

    const hexInBlock = transitionBlock[0].match(/#[0-9a-fA-F]{3,8}\b/g);
    expect(hexInBlock).toBeNull();
  });

  it("themes.css has no universal * selector for transitions", () => {
    expect(themesCss).not.toMatch(/\*:\s*not\s*\(/);
  });

  it("themes.css provides prefers-reduced-motion override", () => {
    expect(themesCss).toContain("prefers-reduced-motion");
  });

  it("tokens.css provides prefers-reduced-motion duration override", () => {
    expect(tokensCss).toContain("prefers-reduced-motion");
    expect(tokensCss).toMatch(/--duration-200:\s*1ms/);
  });
});
