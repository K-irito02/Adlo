/**
 * 任务切片
 * 管理任务中心快照
 */
import type { TaskCenterSnapshot } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface TaskSlice {
  taskCenter?: TaskCenterSnapshot;

  setTaskCenter: (snapshot: TaskCenterSnapshot | undefined) => void;
  clearTaskState: () => void;
}

export const createTaskSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): TaskSlice => ({
  setTaskCenter: (snapshot) => set({ taskCenter: snapshot }),
  clearTaskState: () => set({ taskCenter: undefined }),
});
