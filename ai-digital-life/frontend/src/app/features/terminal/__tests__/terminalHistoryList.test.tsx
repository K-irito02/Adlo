import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { TerminalHistoryList } from '@components/terminal/TerminalHistoryList';
import type { HistoryPalette } from '@features/terminal/historyModel';
import type { TerminalHistorySegment } from '@features/terminal/terminalHistoryStore';

// Finding 2：存储中内容缺失（terminalOutputStore.load 返回 null）的块，
// 必须渲染 unavailableLabel 占位行，而不是留空。
vi.mock('@features/terminal/terminalOutputStore', () => ({
  terminalOutputStore: {
    load: vi.fn(async () => null),
    save: vi.fn(async () => true),
    delete: vi.fn(async () => undefined),
  },
}));

const palette: HistoryPalette = {
  foreground: '#ffffff',
  background: '#000000',
  ansi: Array.from({ length: 16 }, () => '#888888'),
};

const UNAVAILABLE = '该段历史内容不可用';

const segments: TerminalHistorySegment[] = [
  { sessionId: 's1', endedAt: 100, live: false, chunks: [{ lines: 2, size: 1 }] },
];

function Harness() {
  return (
    <div style={{ height: 400, width: 320 }}>
      <TerminalHistoryList
        segments={segments}
        palette={palette}
        readCellMetrics={() => ({ cellWidth: 8, cellHeight: 18 })}
        unavailableLabel={UNAVAILABLE}
      />
    </div>
  );
}

describe('TerminalHistoryList — unavailable chunk (Finding 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders the unavailable label (not a blank row) when load returns null', async () => {
    render(<Harness />);
    // 缺失内容的块走 null 加载路径 → 注入 unavailableLabel 占位行
    await waitFor(() => {
      expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    });
    // 占位只应出现一次（一个缺失块 = 一行占位），divider 时间行不在此列
    expect(screen.getAllByText(UNAVAILABLE)).toHaveLength(1);
  });
});
