import { mockDigitalLifeBridge } from '../mock-bridge';
import type { PatchBridge } from '../shared/ipc';

export function createPreviewPatchBridge(): PatchBridge {
  return mockDigitalLifeBridge.patch;
}
