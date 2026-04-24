import { describe, expect, it } from "vitest";
import {
  createElectronEnv,
  normalizeDevServerUrl,
  sanitizeSpawnEnv,
  resolveNpmSpawn
} from "../../../scripts/dev-desktop-utils.mjs";

describe("normalizeDevServerUrl", () => {
  it("normalizes blank input to the default dev server url", () => {
    expect(normalizeDevServerUrl("")).toBe("http://127.0.0.1:5173/");
  });

  it("adds a trailing slash when missing", () => {
    expect(normalizeDevServerUrl("http://localhost:4173")).toBe("http://localhost:4173/");
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizeDevServerUrl("file:///tmp/app")).toThrow(/http/i);
  });
});

describe("createElectronEnv", () => {
  it("injects the renderer dev url without dropping existing variables", () => {
    const env = createElectronEnv("http://127.0.0.1:5173/", {
      PATH: "C:\\Windows\\System32",
      FOO: "bar"
    });

    expect(env.ADL_RENDERER_DEV_URL).toBe("http://127.0.0.1:5173/");
    expect(env.ELECTRON_DEV).toBe("true");
    expect(env.FOO).toBe("bar");
  });
});

describe("sanitizeSpawnEnv", () => {
  it("drops invalid windows env entries before spawning child processes", () => {
    expect(
      sanitizeSpawnEnv({
        PATH: "C:\\Windows\\System32",
        "=C:": "C:\\Temp",
        EMPTY: undefined
      })
    ).toEqual({
      PATH: "C:\\Windows\\System32"
    });
  });
});

describe("resolveNpmSpawn", () => {
  it("uses the windows shell to launch npm.cmd", () => {
    expect(resolveNpmSpawn(["run", "dev", "-w", "@ai-digital-life/desktop"], "win32")).toEqual({
      command: 'npm.cmd run dev -w "@ai-digital-life/desktop"',
      args: [],
      shell: true
    });
  });

  it("uses direct argv spawning on non-windows platforms", () => {
    expect(resolveNpmSpawn(["run", "dev"], "linux")).toEqual({
      command: "npm",
      args: ["run", "dev"],
      shell: false
    });
  });
});
