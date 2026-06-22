import type { WorkspaceFileChangedEvent } from '@ai-digital-life/kernel';

export function createPreviewEventsBridge() {
  return {
    onFileChanged: (_listener: (event: WorkspaceFileChangedEvent) => void) => () => {},
    onUrlChanged: (_listener: (url: string) => void) => () => {},
    onMetaChanged:
      (_listener: (meta: { title: string; favicon: string; url: string }) => void) => () => {},
  };
}
