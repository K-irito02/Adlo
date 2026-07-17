import type { ReferenceBridge, ReferenceConfig } from '../shared/ipc/reference';
import { invokeIpc } from './tauri-shared';

export function createTauriReferenceBridge(): ReferenceBridge {
  return {
    listReferences: (dataDir) => invokeIpc<ReferenceConfig[]>('list_references', { dataDir }),
    addReference: (dataDir, reference) =>
      invokeIpc<ReferenceConfig[]>('add_reference', { dataDir, reference }),
    removeReference: (dataDir, name) =>
      invokeIpc<ReferenceConfig[]>('remove_reference', { dataDir, name }),
    getReferencesPrompt: (dataDir) => invokeIpc<string>('get_references_prompt', { dataDir }),
  };
}
