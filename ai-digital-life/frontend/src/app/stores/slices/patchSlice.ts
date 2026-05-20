/**
 * 补丁切片
 * 管理补丁集、应用结果等状态
 */
import type {
  PatchSet,
  PatchApplicationResult
} from "@ai-digital-life/kernel";

export interface PatchSlice {
  activePatchSet?: PatchSet;
  latestPatchApplication?: PatchApplicationResult;

  setActivePatchSet: (patchSet: PatchSet | undefined) => void;
  setLatestPatchApplication: (result: PatchApplicationResult | undefined) => void;
  clearPatchState: () => void;
}

export const createPatchSlice = (
  set: (partial: Partial<PatchSlice> | ((state: PatchSlice) => Partial<PatchSlice>)) => void,
  get: () => PatchSlice
): PatchSlice => ({
  setActivePatchSet: (patchSet) => set({ activePatchSet: patchSet }),
  setLatestPatchApplication: (result) => set({ latestPatchApplication: result }),
  clearPatchState: () => set({ activePatchSet: undefined, latestPatchApplication: undefined })
});
