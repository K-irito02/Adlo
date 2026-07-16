import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import { createGitSnapshotActions } from './gitSnapshotActions';
import { createGitBranchActions } from './gitBranchActions';
import { createGitFileOpsActions } from './gitFileOpsActions';

export function createGitActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    ...createGitSnapshotActions(set, get),
    ...createGitBranchActions(set, get),
    ...createGitFileOpsActions(set, get),
  };
}
