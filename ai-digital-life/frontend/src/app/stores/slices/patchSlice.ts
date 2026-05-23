/**
 * 补丁切片
 * 管理补丁集、应用结果等状态
 */
import type {
  PatchSet,
  PatchApplicationResult
} from "@ai-digital-life/kernel";
import type { StoreState } from "../StoreState";

export interface PatchSlice {
  activePatchSet?: PatchSet;
  activePatchSets: Record<string, PatchSet | undefined>;
  latestPatchApplication?: PatchApplicationResult;

  setActivePatchSet: (patchSet: PatchSet | undefined) => void;
  setActivePatchSets: (patchSets: Record<string, PatchSet | undefined>) => void;
  setLatestPatchApplication: (result: PatchApplicationResult | undefined) => void;
  clearPatchState: () => void;
}

export const createPatchSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState
): PatchSlice => ({
  activePatchSets: {},
  setActivePatchSet: (patchSet) => set({ activePatchSet: patchSet }),
  setActivePatchSets: (patchSets) => set({ activePatchSets: patchSets }),
  setLatestPatchApplication: (result) => set({ latestPatchApplication: result }),
  clearPatchState: () => set({ activePatchSet: undefined, activePatchSets: {}, latestPatchApplication: undefined })
});
