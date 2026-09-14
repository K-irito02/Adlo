/* eslint-disable react-refresh/only-export-components -- formatDividerTime 是纯函数，与分隔符组件同文件导出，调用方需要复用同一份格式口径 */

/**
 * 日期分隔符。
 *
 * 与旧实现的关键差别：它不再是**写进终端缓冲区的文本**，而是独立的 DOM 行。
 * 因此「整行铺满 + 日期居中 + 跟随区域宽度变化」全部由 flex 天然满足，
 * 宽度变化不需要任何重放 —— 这正是旧实现做不到的地方。
 * 时间取自该段的 `endedAt`（会话结束时刻），不是归档时刻。
 */
export function formatDividerTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${time} ${date}`;
}

export function TerminalHistoryDivider({
  at,
  label,
}: {
  at: number;
  label: (at: number) => string;
}) {
  return (
    <div className="adl-terminal-history-divider">
      <span className="adl-terminal-history-divider__line" aria-hidden="true" />
      <span className="adl-terminal-history-divider__label">{label(at)}</span>
      <span className="adl-terminal-history-divider__line" aria-hidden="true" />
    </div>
  );
}
