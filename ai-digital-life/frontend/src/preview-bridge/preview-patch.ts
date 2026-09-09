import type { PatchBridge } from '../shared/ipc';

export async function createPreviewPatchBridge(): Promise<PatchBridge> {
  const { mockDigitalLifeBridge } = await import('../mock-bridge');
  return mockDigitalLifeBridge.patch;
}
