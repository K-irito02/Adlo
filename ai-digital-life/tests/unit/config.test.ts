import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, applyConfigPatch, resolveThemeMode, saveConfig, validateConfigFile } from "@ai-digital-life/config";

const tempDirs: string[] = [];

describe("config", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true });
      })
    );
  });

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
        maxRecentWorkspaces: 12,
        modelPreferences: {
          providers: {
            deepseek: {
              enabled: false,
              priority: 2,
              modelId: "deepseek-reasoner"
            }
          }
        }
      })
    ).toMatchObject({
      language: "en-US",
      themeMode: "dark",
      resolvedTheme: "dark",
      logLevel: "debug",
      maxRecentWorkspaces: 12,
      modelPreferences: {
        providers: {
          deepseek: {
            enabled: false,
            priority: 2,
            modelId: "deepseek-reasoner"
          }
        }
      }
    });
  });

  it("applies preference patches without losing validated config", () => {
    expect(
      applyConfigPatch(DEFAULT_CONFIG, {
        language: "en-US",
        themeMode: "dark",
        modelPreferences: {
          minimax: {
            priority: 1
          }
        }
      })
    ).toMatchObject({
      language: "en-US",
      themeMode: "dark",
      resolvedTheme: "dark",
      logLevel: "info",
      modelPreferences: {
        providers: {
          minimax: {
            priority: 1
          }
        }
      }
    });
  });

  it("persists the serializable config shape to disk", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-config-"));
    tempDirs.push(tempDir);

    await saveConfig(tempDir, {
      ...DEFAULT_CONFIG,
      language: "en-US",
      themeMode: "dark",
      resolvedTheme: "dark"
    });

    const raw = await fs.readFile(path.join(tempDir, "config.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({
      language: "en-US",
      themeMode: "dark",
      logLevel: "info",
      maxRecentWorkspaces: 8,
      modelPreferences: DEFAULT_CONFIG.modelPreferences
    });
  });
});
