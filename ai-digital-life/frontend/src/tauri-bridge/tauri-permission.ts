import type {
  PermissionBridge,
  PermissionDecision,
  PermissionRulesetConfig,
} from '../shared/ipc/permission';
import { invokeIpc } from './tauri-shared';

export function createTauriPermissionBridge(): PermissionBridge {
  return {
    listPermissionRules: (dataDir) =>
      invokeIpc<PermissionRulesetConfig>('list_permission_rules', { dataDir }),
    addPermissionRule: (dataDir, rule) =>
      invokeIpc<PermissionRulesetConfig>('add_permission_rule', { dataDir, rule }),
    deletePermissionRule: (dataDir, index) =>
      invokeIpc<PermissionRulesetConfig>('delete_permission_rule', { dataDir, index }),
    setPermissionIncludeDefaults: (dataDir, include) =>
      invokeIpc<PermissionRulesetConfig>('set_permission_include_defaults', { dataDir, include }),
    evaluatePermission: (dataDir, toolName, command, args) =>
      invokeIpc<PermissionDecision>('evaluate_permission', { dataDir, toolName, command, args }),
  };
}
