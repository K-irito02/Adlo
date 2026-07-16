import type { CommandConfig, CommandsConfigBridge } from "../shared/ipc";

export const mockCommandsConfig: CommandsConfigBridge = {
  listCustomCommands: async () => ({ ok: true, data: [] as CommandConfig[] }),
  addCustomCommand: async (_dataDir, command) => ({
    ok: true,
    data: [command] as CommandConfig[],
  }),
  updateCustomCommand: async (_dataDir, _name, command) => ({
    ok: true,
    data: [command] as CommandConfig[],
  }),
  deleteCustomCommand: async () => ({ ok: true, data: [] as CommandConfig[] }),
  renderCommandTemplate: async (template, args, workspace) => ({
    ok: true,
    data: template.replace('$ARGUMENTS', args.join(' ')).replace('$WORKSPACE', workspace),
  }),
};
