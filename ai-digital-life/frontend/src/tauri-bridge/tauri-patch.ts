import type { PatchBridge } from '../shared/ipc';
import type { PatchApplicationResult, PatchSet } from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriPatchBridge(): PatchBridge {
  return {
    getPatchSet: (patchSetId: string) =>
      invokeIpc<PatchSet | undefined>('patch_get_patch_set', { patchSetId }),
    setHunkDecision: (input: {
      patchSetId: string;
      hunkId: string;
      decision: 'pending' | 'accepted' | 'rejected';
    }) => invokeIpc<PatchSet>('patch_set_hunk_decision', { input }),
    applyPatchSet: (patchSetId: string) =>
      invokeIpc<PatchApplicationResult>('patch_apply_patch_set', { patchSetId }),
    rollbackPatchSet: (patchSetId: string) =>
      invokeIpc<PatchSet>('patch_rollback_patch_set', { patchSetId }),
  };
}
