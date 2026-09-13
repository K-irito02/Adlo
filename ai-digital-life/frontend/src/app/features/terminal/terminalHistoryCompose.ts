/**
 * 历史视图的**回放组合**工具（纯函数，便于单测）。
 *
 * 背景：历史视图是一个**只读 xterm**，按「旧 → 新」把若干段已结束会话的
 * SerializeAddon 快照依次写进同一个缓冲区。快照内部的坐标是相对它自己那一屏的，
 * 直接首尾相接会互相覆盖（后一段会从上一段遗留的光标位置开始写）——所以每写完
 * 一段，必须先把光标推进到「该段内容最末一行的下一行」，再写分隔条与下一段。
 *
 * 本文件只放不依赖 DOM / xterm 的判定逻辑；扫描缓冲区找「最末内容行」由调用方提供。
 */

/** 段与段之间的分隔条：**紧贴**该段内容的最后一行，其后留一行间距再接下段 */
export function historySeparator(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // 注意不要加前导 `\r\n`：调用方已把光标推进到内容最后一行的下一行，
  // 再加一个换行就会在「历史内容」与它自己的分隔条之间多出一整行空白。
  return `\r\x1b[90m─── ${time} ${date} ───\x1b[0m\r\n\r\n`;
}

/**
 * 还需要补几个换行，才能让光标落到「当前段内容最末行的下一行」。
 *
 * 行号均为**缓冲区绝对行号**（`baseY + cursorY`）。
 * `lastContentRow` 为 `null` 表示光标下方已无内容 → 无需再补（返回 0，避免空转下移）。
 */
export function newlinesToAdvance(cursorRow: number, lastContentRow: number | null): number {
  if (lastContentRow === null) {
    return 0;
  }
  const target = lastContentRow + 1;
  return cursorRow > target ? 0 : target - cursorRow;
}

/**
 * 从 `cursorRow` 向下扫描，找出最后一行有内容的绝对行号；都没有内容则返回 `null`。
 *
 * 只往下扫是有意为之：快照写入后，光标必然落在「本段内容区间之内」，
 * 而更早的段位于光标上方，不应参与本段的边界判定。
 *
 * 必须区分「光标所在行本身有内容」（需再下移一行）与「光标下方什么都没有」（不需下移）——
 * 否则调用方会一行一行地空转下移（线上事故：分隔条被写到内容下方上千行处）。
 */
export function findLastContentRow(
  cursorRow: number,
  totalRows: number,
  rowText: (row: number) => string,
): number | null {
  let last: number | null = null;
  for (let y = cursorRow; y < totalRows; y += 1) {
    if (rowText(y).trim() !== '') {
      last = y;
    }
  }
  return last;
}
