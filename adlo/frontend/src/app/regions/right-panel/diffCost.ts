/** 差异代价画像：体积与行数（DP 单元格成本由 changePreviewDiffRanges 自己负责）。 */

export interface DiffCostProfile {
  baseChars: number;
  currentChars: number;
  baseLines: number;
  currentLines: number;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  let lines = 1;
  let index = text.indexOf('\n');
  while (index !== -1) {
    lines += 1;
    index = text.indexOf('\n', index + 1);
  }
  return lines;
}

export function profileDiffCost(base: string, current: string): DiffCostProfile {
  return {
    baseChars: base.length,
    currentChars: current.length,
    baseLines: countLines(base),
    currentLines: countLines(current),
  };
}
