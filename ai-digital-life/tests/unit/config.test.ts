import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveThemeMode, validateConfigFile } from "@ai-digital-life/config";

describe("config", () => {
  it("resolves system theme from OS preference", () => {
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
  });

  it("falls back to defaults for invalid values", () => {
    expect(
      validateConfigFile({
        language: "unknown",
        themeMode: "invalid",
        logLevel: "invalid",
        maxRecentWorkspaces: -1
      })
    ).toEqual(DEFAULT_CONFIG);
  });

  it("accepts valid thin-slice config values", () => {
    expect(
      validateConfigFile({
        language: "en-US",
        themeMode: "dark",
        logLevel: "debug",
        maxRecentWorkspaces: 12
      })
    ).toMatchObject({
      language: "en-US",
      themeMode: "dark",
      resolvedTheme: "dark",
      logLevel: "debug",
      maxRecentWorkspaces: 12
    });
  });
});
