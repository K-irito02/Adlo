import { GLOBAL_WORKSPACE_ID } from '@adlo/kernel';

export { GLOBAL_WORKSPACE_ID };

export function isGlobalWorkspaceId(workspaceId: string | undefined): boolean {
  return workspaceId === GLOBAL_WORKSPACE_ID;
}

export function workspaceNameFromPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/').replace(/\/+$/g, '');
  return normalized.split('/').pop() || normalized || 'workspace';
}
