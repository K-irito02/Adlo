import type { CommandBridge } from "../shared/ipc/command";
import type { CommandRequest, CommandRunResult } from "@ai-digital-life/kernel";
import { currentWorkspaceMeta } from "./mock-shared";

export const mockCommand: CommandBridge = {
  run: async (input) => ({
    ok: true,
    data: {
      status: input.command.includes('install') ? 'waiting-approval' : 'completed',
      taskId: `task-command-${Date.now()}`,
      request: {
        id: `command-${Date.now()}`,
        workspaceId: currentWorkspaceMeta?.id ?? 'global',
        profile: input.command.includes('install') ? 'install' : 'custom',
        command: input.command,
        args: input.args,
        shell: input.shell ?? false,
        riskLevel: input.command.includes('install') ? 'high' : 'medium',
        createdAt: Date.now(),
      },
    } satisfies CommandRunResult,
  }),
  listRecent: async (_limit?: number): Promise<{ ok: true; data: CommandRequest[] }> => ({
    ok: true,
    data: [],
  }),
};
