import { useEffect, useMemo, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { terminalOutputStore } from '@features/terminal/terminalOutputStore';
import {
  findLastContentRow,
  historySeparator,
  newlinesToAdvance,
} from '@features/terminal/terminalHistoryCompose';
import type { TerminalHistorySegment } from '@features/terminal/terminalHistoryStore';
import { readTerminalFontFamily, readTerminalTheme } from '@features/terminal/terminalXtermPool';
import '@xterm/xterm/css/xterm.css';

interface TerminalHistoryViewProps {
  segments: TerminalHistorySegment[];
}

/**
 * 重启前的**只读历史**视图。
 *
 * 为什么独立于实时终端：ConPTY 只认自己那块 rows 行的屏幕、从第 1 行算坐标。
 * 把历史注入实时终端缓冲区，会让两者的光标坐标系产生「等于历史高度」的永久偏移，
 * 之后 shell 发出的任何光标指令都会落在历史里（跳回顶部、覆盖历史）。
 * 因此历史必须在**另一个** xterm 实例里渲染，实时终端保持干净。
 *
 * 本组件只回放快照、不接受输入（`disableStdin`），也不与任何 PTY 相连。
 */
export function TerminalHistoryView({ segments }: TerminalHistoryViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 用 sessionId 串联作为依赖：父组件每次渲染都会传入新数组，直接依赖数组会反复重建终端。
  const segmentsKey = useMemo(
    () => segments.map((s) => `${s.sessionId}@${s.archivedAt}`).join('|'),
    [segments],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !segmentsKey) {
      return;
    }

    const hostEl = document.createElement('div');
    hostEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;';
    container.appendChild(hostEl);

    const theme = readTerminalTheme();
    const terminal = new Terminal({
      fontSize: 13,
      fontFamily: readTerminalFontFamily(),
      // 只读视图：光标颜色与底色相同 → 不可见
      theme: { ...theme, cursor: theme.background, cursorAccent: theme.background },
      allowProposedApi: true,
      // 历史是跨多次重启累积的，scrollback 必须留足，否则较早的段会被裁掉。
      // 上界推导：MAX_HISTORY_SEGMENTS(5) × 单段快照上限（serialize scrollback 1000 + 一屏行数）
      // ≈ 5300 行，取 8000 留出余量。再大只是白白增加常驻内存（xterm 会为 scrollback 预分配行缓冲），
      // 若调大 MAX_HISTORY_SEGMENTS 或 serialize 的 scrollback，需同步上调此值。
      scrollback: 8000,
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: 'bar',
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostEl);
    try {
      fitAddon.fit();
    } catch {
      // 面板可能尚未布局（隐藏/零尺寸），ResizeObserver 会在可见后重新 fit
    }

    let cancelled = false;
    // xterm 在 dispose() 之后不再触发 write 的回调：把挂起的 resolver 收进集合，
    // 卸载时统一 resolve，避免回放 IIFE 的 await 在组件卸载后永久挂起。
    const pendingWrites = new Set<() => void>();
    const write = (data: string) =>
      new Promise<void>((resolve) => {
        if (cancelled) {
          resolve();
          return;
        }
        pendingWrites.add(resolve);
        terminal.write(data, () => {
          pendingWrites.delete(resolve);
          resolve();
        });
      });

    void (async () => {
      try {
        for (const segment of segments) {
          const snapshot = await terminalOutputStore.load(segment.sessionId);
          if (cancelled) {
            return;
          }
          if (snapshot) {
            // 防御性回列首：正常路径里上段分隔条与首段起点都已把光标放在列 0，
            // 这里再兜一次，避免快照首行被写到非 0 列造成整段错位（与快照合并为一次写入）。
            await write(`\r${snapshot}`);
            // 把光标推进到本段内容最末行的下一行，避免下一段覆盖本段。
            // findLastContentRow 返回 null 时（光标下方已无内容）newlinesToAdvance 为 0，
            // 循环最多走两轮即退出——不能再出现「逐行空转」把分隔条顶下去的情况。
            for (let guard = 0; guard < 20; guard += 1) {
              const buffer = terminal.buffer.active;
              const cursorRow = buffer.baseY + buffer.cursorY;
              const lastContentRow = findLastContentRow(cursorRow, buffer.length, (row) => {
                const line = buffer.getLine(row);
                return line ? line.translateToString(true) : '';
              });
              const newlines = newlinesToAdvance(cursorRow, lastContentRow);
              if (newlines === 0) {
                break;
              }
              await write('\n'.repeat(newlines));
            }
          }
          await write(historySeparator(segment.archivedAt));
        }
        if (!cancelled) {
          terminal.scrollToBottom();
        }
      } catch (err) {
        // 异步回放边界：存储/解析异常时不要让 unhandled rejection 静默吞掉问题
        console.error('Terminal history replay failed:', err);
      }
    })();

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // 容器已被卸载
      }
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      // 先解除所有挂起的 write（dispose 后其回调不会再触发）
      for (const resolve of pendingWrites) {
        resolve();
      }
      pendingWrites.clear();
      terminal.dispose();
      hostEl.remove();
    };
    // segmentsKey 是 segments 的稳定指纹，用它避免每次渲染重建终端
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentsKey]);

  return <div ref={containerRef} className="adl-terminal-history__canvas" />;
}
