import type { IpcResult } from '@ai-digital-life/kernel';

export type PermissionDecision = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  pattern: string;
  decision: PermissionDecision;
  tool_type: string;
  always: boolean;
  reason: string;
}

export interface PermissionRulesetConfig {
  custom_rules: PermissionRule[];
  include_defaults: boolean;
}

export interface PermissionBridge {
  listPermissionRules(dataDir: string): Promise<IpcResult<PermissionRulesetConfig>>;
  addPermissionRule(
    dataDir: string,
    rule: PermissionRule
  ): Promise<IpcResult<PermissionRulesetConfig>>;
  deletePermissionRule(dataDir: string, index: number): Promise<IpcResult<PermissionRulesetConfig>>;
  setPermissionIncludeDefaults(
    dataDir: string,
    include: boolean
  ): Promise<IpcResult<PermissionRulesetConfig>>;
  evaluatePermission(
    dataDir: string,
    toolName: string,
    command: string,
    args: string[]
  ): Promise<IpcResult<PermissionDecision>>;
}
