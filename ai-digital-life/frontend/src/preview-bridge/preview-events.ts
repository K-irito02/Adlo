import type { WorkspaceFileChangedEvent } from '@ai-digital-life/kernel';

export function createPreviewEventsBridge() {
  return {
    onFileChanged: (_listener: (event: WorkspaceFileChangedEvent) => void) => () => {},
  };
}
