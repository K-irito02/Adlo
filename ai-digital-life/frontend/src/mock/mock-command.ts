import type { CommandBridge } from "../shared/ipc/command";
import type { CommandRequest, CommandRunResult } from "@ai-digital-life/kernel";
import { currentWorkspaceMeta } from "./mock-shared";

export const mockCommand: CommandBridge = {
  run: async (input) => {
    // Mirror the server: medium/high-risk commands are denied because the
    // approval flow that once gated them is removed (host / dsh owns
    // approvals). Only the completed result is produced.
    const risky = input.command.includes('install');
    if (risky) {
      return {
        ok: false as const,
        error: {
          code: 'SECURITY_ERROR',
          message: "Command requires approval; the approval flow has been removed (host-owned).",
        },
      };
    }
    return {
      ok: true as const,
      data: {
        status: 'completed' as const,
        taskId: `task-command-${Date.now()}`,
        request: {
          id: `command-${Date.now()}`,
          workspaceId: currentWorkspaceMeta?.id ?? 'global',
          profile: 'custom' as const,
          command: input.command,
          args: input.args,
          shell: input.shell ?? false,
          riskLevel: 'low' as const,
          createdAt: Date.now(),
        },
      } satisfies CommandRunResult,
    };
  },
  listRecent: async (_limit?: number): Promise<{ ok: true; data: CommandRequest[] }> => ({
    ok: true,
    data: [],
  }),
};
