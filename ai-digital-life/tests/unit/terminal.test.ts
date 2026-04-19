import { describe, expect, it } from "vitest";
import {
  TerminalService,
  analyzeRetryDisposition,
  buildValidationResult,
  classifyCommandProfile,
  createRetrySummary,
  parseDiagnostics
} from "@ai-digital-life/terminal";

describe("terminal", () => {
  it("executeStream forwards stdout chunks", async () => {
    const logger = { info: () => undefined, warn: () => undefined } as import("@ai-digital-life/logger").Logger;
    const service = new TerminalService(logger);
    const chunks: string[] = [];
    const result = await service.executeStream(
      {
        id: "cmd-stream-1",
        workspaceId: "ws",
        profile: "custom",
        command: process.execPath,
        args: ["-e", "console.log('stream-line')"],
        shell: false,
        riskLevel: "low",
        createdAt: Date.now()
      },
      process.cwd(),
      {
        onStdout: (text) => {
          chunks.push(text);
        }
      }
    );
    expect(result.success).toBe(true);
    expect(chunks.join("")).toContain("stream-line");
  });

  it("classifies common command profiles", () => {
    expect(classifyCommandProfile("npm run test")).toEqual({
      profile: "test",
      riskLevel: "low"
    });
    expect(classifyCommandProfile("npm install")).toEqual({
      profile: "install",
      riskLevel: "high"
    });
  });

  it("parses typescript diagnostics", () => {
    const diagnostics = parseDiagnostics("src/index.ts(12,4): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      source: "typescript",
      path: "src/index.ts",
      line: 12,
      column: 4
    });
  });

  it("builds validation results from command execution output", () => {
    const result = buildValidationResult({
      workspaceId: "workspace-1",
      runId: "run-1",
      patchSetId: "patch-1",
      commandResult: {
        request: {
          id: "command-1",
          workspaceId: "workspace-1",
          runId: "run-1",
          profile: "build",
          command: "npm",
          args: ["run", "build"],
          shell: false,
          riskLevel: "low",
          createdAt: 1
        },
        exitCode: 1,
        stdout: "",
        stderr: "src/index.ts(12,4): error TS2322: Type 'string' is not assignable to type 'number'.",
        summary: "build failed",
        success: false,
        startedAt: 1,
        completedAt: 2
      }
    });

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.patchSetId).toBe("patch-1");
  });

  it("classifies transient command failures as retryable", () => {
    expect(analyzeRetryDisposition("network error: timeout", 1)).toEqual({
      retryable: true,
      reason: "Transient timeout detected."
    });
    expect(analyzeRetryDisposition("src/index.ts(12,4): error TS2322", 1)).toEqual({
      retryable: false,
      reason: "Failure looks deterministic and needs manual or agent repair."
    });
  });

  it("summarizes retry attempts", () => {
    expect(
      createRetrySummary([
        {
          attempt: 1,
          success: false,
          retryable: true,
          reason: "Transient timeout detected.",
          summary: "Command failed."
        },
        {
          attempt: 2,
          success: true,
          retryable: false,
          reason: "Command succeeded.",
          summary: "Command completed successfully."
        }
      ])
    ).toContain("2 attempts");
  });
});
