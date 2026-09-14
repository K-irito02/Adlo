import { memo } from 'react';
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
        <span key={i} style={resolveRunStyle(run, palette)}>
          {run.text}
        </span>
      ))}
    </div>
  );
});
