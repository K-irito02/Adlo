import { hslToHex } from './hslToHex';

/** 关键分支的固定语义色 */
const FIXED_BRANCH_COLORS: Record<string, string> = {
  main: '#3b82f6',
  master: '#3b82f6',
  develop: '#06b6d4',
  release: '#8b5cf6',
  hotfix: '#ef4444',
};

/**
 * 方案 C：关键分支固定语义色，其余分支 HSL 均分色相空间。
 * 同一分支名在同一组 allBranches 中始终获得相同颜色。
 */
export function getBranchColor(branchName: string, allBranches: string[]): string {
  const fixed = FIXED_BRANCH_COLORS[branchName];
  if (fixed) {
    return fixed;
  }

  const nonFixedBranches = allBranches.filter((b) => !FIXED_BRANCH_COLORS[b]);
  const nonFixedIndex = nonFixedBranches.indexOf(branchName);
  if (nonFixedIndex === -1 || nonFixedBranches.length === 0) {
    return '#94a3b8';
  }
  const hue = (nonFixedIndex / nonFixedBranches.length) * 360;
  return hslToHex(hue, 70, 50);
}
