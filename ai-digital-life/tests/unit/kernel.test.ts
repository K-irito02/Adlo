import { describe, expect, it } from "vitest";
import { createWorkspaceId, defaultAppState, isChildPath, normalizePath, ok, resultErr } from "@ai-digital-life/kernel";

describe("kernel", () => {
  it("creates ipc success results", () => {
    expect(ok({ value: 1 })).toEqual({
      ok: true,
      data: { value: 1 }
    });
  });

  it("creates typed failure results", () => {
    const result = resultErr(new Error("boom"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("boom");
    }
  });

  it("normalizes and compares child paths", () => {
    const parentPath = normalizePath("C:\\workspace");
    const childPath = normalizePath("C:\\workspace\\project");
    expect(isChildPath(parentPath, childPath)).toBe(true);
  });

  it("creates stable workspace ids", () => {
    const first = createWorkspaceId("E:\\repo");
    const second = createWorkspaceId("E:\\repo");
    expect(first).toBe(second);
  });

  it("returns the default app state", () => {
    expect(defaultAppState()).toMatchObject({
      schemaVersion: "1",
      recentWorkspaces: []
    });
  });
});
