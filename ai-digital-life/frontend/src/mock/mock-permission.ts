import type {
  PermissionBridge,
  PermissionDecision,
  PermissionRulesetConfig,
} from "../shared/ipc";

export const mockPermission: PermissionBridge = {
  listPermissionRules: async () => ({
    ok: true,
    data: { custom_rules: [], include_defaults: true } satisfies PermissionRulesetConfig,
  }),
  addPermissionRule: async (_dataDir, rule) => ({
    ok: true,
    data: { custom_rules: [rule], include_defaults: true } satisfies PermissionRulesetConfig,
  }),
  deletePermissionRule: async () => ({
    ok: true,
    data: { custom_rules: [], include_defaults: true } satisfies PermissionRulesetConfig,
  }),
  setPermissionIncludeDefaults: async (_dataDir, include) => ({
    ok: true,
    data: { custom_rules: [], include_defaults: include } satisfies PermissionRulesetConfig,
  }),
  evaluatePermission: async () => ({ ok: true, data: 'allow' as PermissionDecision }),
};
