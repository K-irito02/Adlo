import { memo } from 'react';
import {
  cellWidthOf,
  resolveRunStyle,
  type HistoryPalette,
  type HistoryRun,
} from '@features/terminal/historyModel';

/**
 * 网格风险样式：浏览器可能把这些 run 的字形渲染成非标准步进
 * （xterm.js issue #5164：粗体字形是 DOM 错位的主因之一）。
 * 斜体一并纳入属保守取舍（其步进通常不变，但合成斜体在部分字体上会偏移），
 * 代价仅是多走一次钉格路径。
 */
function isGridRisky(run: HistoryRun): boolean {
  if (run.bold || run.italic) {
    return true;
  }
  for (const ch of run.text) {
    if (cellWidthOf(ch) === 2) {
      return true;
    }
  }
  return false;
}

/**
 * 单个显示行。行高由 CSS 变量固定为实测 cell 高，保证虚拟化偏移是整数乘法。
 *
 * 钉格粒度是**整行**而非单个危险 run：同一行里若一部分按格宽钉死、另一部分
 * 走字体自然步进，两种步进不一致时行内会从分界处开始漂移（后续列错位）。
 * 代价是钉格行每字一个 span（虚拟列表已把挂载行数限定在视口 + overscan，
 * 且有宽字/粗斜体才走此路径，纯 ASCII 行仍是一个 run 一个 span）。
 */
export const TerminalHistoryRow = memo(function TerminalHistoryRow({
  runs,
  palette,
}: {
  runs: HistoryRun[];
  palette: HistoryPalette;
}) {
  const pinned = runs.some(isGridRisky);
  return (
    <div className="adl-terminal-history-row">
      {pinned
        ? runs.map((run, i) => (
            <PinnedRun key={i} run={run} palette={palette} />
          ))
        : runs.map((run, i) => (
            /* 展开成新的对象字面量：radix 的 CSSProperties 带模板字面量索引签名，
               interface 拿不到隐式索引签名，只有新字面量才能赋值给 style */
            <span key={i} style={{ ...resolveRunStyle(run, palette) }}>
              {run.text}
            </span>
          ))}
    </div>
  );
});

/**
 * 逐字钉格：每个字符占 `w × cell 宽` 的 inline-block 格，
 * 与 xterm（canvas 按单元格绝对定位字形）同网格，CJK/粗体不再逐列漂移。
 * 单元格宽度复用容器上的 `--adl-terminal-cell-width`（F6 实测值），
 * 字符格数复用咬合折行同一套 `cellWidthOf` 口径。
 */
function PinnedRun({ run, palette }: { run: HistoryRun; palette: HistoryPalette }) {
  const style = resolveRunStyle(run, palette);
  return (
    <span style={{ ...style }} className="adl-terminal-history-run">
      {[...run.text].map((ch, j) => (
        <span
          key={j}
          className="adl-terminal-history-cell"
          style={{ width: `calc(${cellWidthOf(ch)} * var(--adl-terminal-cell-width, 8px))` }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
