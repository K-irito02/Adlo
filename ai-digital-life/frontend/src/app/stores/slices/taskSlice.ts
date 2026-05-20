/**
 * 任务切片
 * 管理任务中心快照
 */
import type { TaskCenterSnapshot } from "@ai-digital-life/kernel";

export interface TaskSlice {
  taskCenter?: TaskCenterSnapshot;

  setTaskCenter: (snapshot: TaskCenterSnapshot | undefined) => void;
  clearTaskState: () => void;
}

export const createTaskSlice = (
  set: (partial: Partial<TaskSlice> | ((state: TaskSlice) => Partial<TaskSlice>)) => void,
  get: () => TaskSlice
): TaskSlice => ({
  setTaskCenter: (snapshot) => set({ taskCenter: snapshot }),
  clearTaskState: () => set({ taskCenter: undefined })
});
