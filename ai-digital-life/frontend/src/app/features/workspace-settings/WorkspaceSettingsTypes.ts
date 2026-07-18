export interface WorkspaceSettingsState {
  maxConcurrent: number;
  priorityIds: string[];
  deferredIds: string[];
}

export type ContainerId = 'priority' | 'deferred' | 'natural';

export interface DraggableWorkspace {
  id: string;
  name: string;
}
