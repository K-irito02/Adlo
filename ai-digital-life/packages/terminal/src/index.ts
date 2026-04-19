import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  CommandExecutionResult,
  CommandProfile,
  CommandRequest,
  DiagnosticSummary,
  RiskLevel,
  ValidationResult,
  WorkspaceType
} from "@ai-digital-life/kernel";
import { createId } from "@ai-digital-life/kernel";
import type { Logger } from "@ai-digital-life/logger";

export interface RetryAttemptSummary {
  attempt: number;
  success: boolean;
  retryable: boolean;
  reason: string;
  summary: string;
}

export interface RetryExecutionResult {
  result: CommandExecutionResult;
  attempts: RetryAttemptSummary[];
}

type RetryDisposition = {
  retryable: boolean;
  reason: string;
};

export function classifyCommandProfile(command: string): { profile: CommandProfile; riskLevel: RiskLevel } {
  const normalized = command.toLowerCase();
  if (normalized.includes("test")) {
    return { profile: "test", riskLevel: "low" };
  }
  if (normalized.includes("build")) {
    return { profile: "build", riskLevel: "low" };
  }
  if (normalized.includes("lint")) {
    return { profile: "lint", riskLevel: "low" };
  }
  if (normalized.includes("install")) {
    return { profile: "install", riskLevel: "high" };
  }
  return { profile: "custom", riskLevel: "medium" };
}

function summarizeOutput(stdout: string, stderr: string, exitCode: number | null): string {
  const source = stderr.trim() || stdout.trim();
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? (exitCode === 0 ? "Command completed successfully." : "Command failed.");
  return firstLine.slice(0, 240);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function analyzeRetryDisposition(output: string, exitCode: number | null): RetryDisposition {
  if (exitCode === 0) {
    return {
      retryable: false,
      reason: "Command succeeded."
    };
  }

  const normalized = output.toLowerCase();
  const retryablePatterns = [
    { pattern: "timed out", reason: "Transient timeout detected." },
    { pattern: "timeout", reason: "Transient timeout detected." },
    { pattern: "econnreset", reason: "Connection reset detected." },
    { pattern: "eai_again", reason: "Temporary DNS failure detected." },
    { pattern: "network error", reason: "Network failure detected." },
    { pattern: "temporary failure", reason: "Temporary failure detected." },
    { pattern: "resource busy", reason: "File lock or resource busy condition detected." },
    { pattern: "ebusy", reason: "File lock or resource busy condition detected." }
  ];

  for (const candidate of retryablePatterns) {
    if (normalized.includes(candidate.pattern)) {
      return {
        retryable: true,
        reason: candidate.reason
      };
    }
  }

  return {
    retryable: false,
    reason: "Failure looks deterministic and needs manual or agent repair."
  };
}

export function createRetrySummary(attempts: RetryAttemptSummary[]): string {
  if (attempts.length <= 1) {
    return attempts[0]?.summary ?? "Command execution finished.";
  }

  const finalAttempt = attempts[attempts.length - 1];
  return `${finalAttempt.summary} (${attempts.length} attempts, last retry reason: ${finalAttempt.reason})`;
}

export function parseDiagnostics(output: string): DiagnosticSummary[] {
  const diagnostics: DiagnosticSummary[] = [];
  const lines = output.split(/\r?\n/);

  const patterns: Array<{
    source: DiagnosticSummary["source"];
    severity: DiagnosticSummary["severity"];
    regex: RegExp;
  }> = [
    {
      source: "typescript",
      severity: "error",
      regex: /^(.+)\((\d+),(\d+)\): error TS\d+: (.+)$/
    },
    {
      source: "eslint",
      severity: "error",
      regex: /^(.+): line (\d+), col (\d+), (Error|Warning) - (.+)$/
    },
    {
      source: "vite",
      severity: "error",
      regex: /^(.+):(\d+):(\d+):\s*(error|warning)\s*:\s*(.+)$/i
    },
    {
      source: "vitest",
      severity: "error",
      regex: /^\s*FAIL\s+(.+)$/
    },
    {
      source: "jest",
      severity: "error",
      regex: /^\s*●\s+(.+)$/
    }
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) {
        continue;
      }

      if (pattern.source === "typescript") {
        diagnostics.push({
          id: createId("diag"),
          source: pattern.source,
          severity: pattern.severity,
          path: match[1],
          line: Number(match[2]),
          column: Number(match[3]),
          message: match[4]
        });
        break;
      }

      if (pattern.source === "eslint" || pattern.source === "vite") {
        diagnostics.push({
          id: createId("diag"),
          source: pattern.source,
          severity: match[4]?.toLowerCase() === "warning" || match[4] === "Warning" ? "warning" : pattern.severity,
          path: match[1],
          line: Number(match[2]),
          column: Number(match[3]),
          message: match[5]
        });
        break;
      }

      diagnostics.push({
        id: createId("diag"),
        source: pattern.source,
        severity: pattern.severity,
        message: match[1]
      });
      break;
    }
  }

  return diagnostics;
}

export function buildValidationResult(input: {
  workspaceId: string;
  runId?: string;
  patchSetId?: string;
  commandResult: CommandExecutionResult;
}): ValidationResult {
  const mergedOutput = [input.commandResult.stderr, input.commandResult.stdout].filter(Boolean).join("\n");
  const diagnostics = parseDiagnostics(mergedOutput);
  return {
    id: createId("validation"),
    workspaceId: input.workspaceId,
    runId: input.runId,
    patchSetId: input.patchSetId,
    status: input.commandResult.success ? "passed" : "failed",
    summary: input.commandResult.success
      ? "Validation command completed successfully."
      : input.commandResult.summary,
    diagnostics,
    createdAt: input.commandResult.completedAt
  };
}

function isWorkspacePath(rootPath: string, cwd: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(cwd);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

export function detectWorkspaceValidationCommand(rootPath: string, workspaceType: WorkspaceType): {
  command: string;
  args: string[];
  profile: CommandProfile;
} | undefined {
  if (workspaceType !== "node") {
    return undefined;
  }

  const packageJsonPath = path.join(rootPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (packageJson.scripts?.test) {
      return { command: "npm", args: ["run", "test"], profile: "test" };
    }
    if (packageJson.scripts?.build) {
      return { command: "npm", args: ["run", "build"], profile: "build" };
    }
    if (packageJson.scripts?.lint) {
      return { command: "npm", args: ["run", "lint"], profile: "lint" };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export class TerminalService {
  constructor(private readonly logger: Logger) {}

  async execute(request: CommandRequest, workspaceRoot: string): Promise<CommandExecutionResult> {
    if (!isWorkspacePath(workspaceRoot, workspaceRoot)) {
      throw new Error("Invalid workspace root.");
    }

    const startedAt = Date.now();
    this.logger.info(`Executing command: ${request.command} ${request.args.join(" ")}`, {
      profile: request.profile,
      runId: request.runId
    });

    return new Promise<CommandExecutionResult>((resolve, reject) => {
      const child = spawn(request.command, request.args, {
        cwd: workspaceRoot,
        shell: request.shell,
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";
      let timeoutHandle: NodeJS.Timeout | undefined;

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        reject(error);
      });
      child.on("close", (exitCode, signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        const completedAt = Date.now();
        resolve({
          request,
          exitCode,
          signal: signal ?? undefined,
          stdout,
          stderr,
          summary: summarizeOutput(stdout, stderr, exitCode),
          success: exitCode === 0,
          startedAt,
          completedAt
        });
      });

      timeoutHandle = setTimeout(() => {
        child.kill();
      }, 60_000);
    });
  }

  async executeWithRetries(
    request: CommandRequest,
    workspaceRoot: string,
    options?: {
      maxAttempts?: number;
      baseDelayMs?: number;
    }
  ): Promise<RetryExecutionResult> {
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 2);
    const baseDelayMs = Math.max(0, options?.baseDelayMs ?? 250);
    const attempts: RetryAttemptSummary[] = [];
    let finalResult: CommandExecutionResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.execute(request, workspaceRoot);
      const disposition = analyzeRetryDisposition(`${result.stderr}\n${result.stdout}`, result.exitCode);
      attempts.push({
        attempt,
        success: result.success,
        retryable: disposition.retryable,
        reason: disposition.reason,
        summary: result.summary
      });
      finalResult = result;

      if (result.success || !disposition.retryable || attempt === maxAttempts) {
        break;
      }

      const delayMs = baseDelayMs * attempt;
      this.logger.warn(`Retrying command after transient failure: ${request.command} ${request.args.join(" ")}`, {
        attempt,
        delayMs,
        reason: disposition.reason
      });
      await sleep(delayMs);
    }

    if (!finalResult) {
      throw new Error("No command result produced.");
    }

    return {
      result: {
        ...finalResult,
        summary: createRetrySummary(attempts)
      },
      attempts
    };
  }
}
