import { memo, type CSSProperties } from 'react';
import {
  resolveRunStyle,
  type HistoryPalette,
  type HistoryRun,
} from '@features/terminal/historyModel';

/** 单个显示行。行高由 CSS 变量固定为实测 cell 高，保证虚拟化偏移是整数乘法 */
export const TerminalHistoryRow = memo(function TerminalHistoryRow({
  runs,
  palette,
}: {
  runs: HistoryRun[];
  palette: HistoryPalette;
}) {
  return (
    <div className="adl-terminal-history-row">
      {runs.map((run, i) => (
        // ResolvedRunStyle 的字段是 CSSProperties 的结构子集，但 fontStyle / textDecoration
        // 在 historyModel 里被宽化成了 string；React 的 style 要求字面量联合，故在边界收窄。
        <span key={i} style={resolveRunStyle(run, palette) as CSSProperties}>
          {run.text}
        </span>
      ))}
    </div>
  );
});
