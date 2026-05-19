import { describe, expect, it } from "vitest";
import { isGlobalWorkspaceId, workspaceNameFromPath, GLOBAL_WORKSPACE_ID } from "./workspaceScope";

describe("workspaceScope", () => {
  describe("GLOBAL_WORKSPACE_ID", () => {
    it("is exported correctly", () => {
      expect(GLOBAL_WORKSPACE_ID).toBeDefined();
      expect(typeof GLOBAL_WORKSPACE_ID).toBe("string");
    });
  });

  describe("isGlobalWorkspaceId", () => {
    it("returns true for global workspace ID", () => {
      expect(isGlobalWorkspaceId(GLOBAL_WORKSPACE_ID)).toBe(true);
    });

    it("returns false for regular workspace ID", () => {
      expect(isGlobalWorkspaceId("ws-123")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isGlobalWorkspaceId(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isGlobalWorkspaceId("")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isGlobalWorkspaceId(null as any)).toBe(false);
    });
  });

  describe("workspaceNameFromPath", () => {
    it("extracts name from Unix path", () => {
      expect(workspaceNameFromPath("/home/user/projects/myapp")).toBe("myapp");
    });

    it("extracts name from Windows path", () => {
      expect(workspaceNameFromPath("C:\\Users\\Projects\\MyApp")).toBe("MyApp");
    });

    it("handles path with trailing slash", () => {
      expect(workspaceNameFromPath("/home/user/projects/myapp/")).toBe("myapp");
    });

    it("handles path with multiple trailing slashes", () => {
      expect(workspaceNameFromPath("/home/user/projects/myapp///")).toBe("myapp");
    });

    it("returns last segment for simple path", () => {
      expect(workspaceNameFromPath("workspace")).toBe("workspace");
    });

    it("handles root path", () => {
      expect(workspaceNameFromPath("/")).toBe("workspace");
    });

    it("handles empty string", () => {
      expect(workspaceNameFromPath("")).toBe("workspace");
    });

    it("handles Windows path with forward slashes", () => {
      expect(workspaceNameFromPath("C:/Users/Projects/MyApp")).toBe("MyApp");
    });

    it("handles mixed separators", () => {
      expect(workspaceNameFromPath("C:\\Users/Projects\\MyApp")).toBe("MyApp");
    });
  });
});
