import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { TerminalHistoryList } from '@components/terminal/TerminalHistoryList';
import { terminalOutputStore } from '@features/terminal/terminalOutputStore';
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

  /** 所有历史行的 textContent 拼接（占位文本含 CJK，逐字钉格后被拆进多个 cell span） */
  function joinedRowText(): string {
    return [...document.querySelectorAll('.adl-terminal-history-row')]
      .map((r) => r.textContent ?? '')
      .join('');
  }

  it('renders the unavailable label (not a blank row) when load returns null', async () => {
    render(<Harness />);
    // 缺失内容的块走 null 加载路径 → 注入 unavailableLabel 占位行。
    // 折行按**当前 cols** 派生（jsdom 的 clientWidth 为 0 → cols=1，占位被逐字折成多行），
    // 故断言「拼接后的行文本」包含且仅包含一次占位文案；divider 时间行不在此列。
    await waitFor(() => {
      expect(joinedRowText()).toContain(UNAVAILABLE);
    });
    const joined = joinedRowText();
    expect(joined.split(UNAVAILABLE)).toHaveLength(2);
  });

  /** 已挂载的历史行数（含分隔行） */
  function rowCount(): number {
    return document.querySelectorAll('.adl-terminal-history-list__row').length;
  }

  it('列数变化后已加载块按新列数重新折行（避免变窄后右端文字被 overflow-x 裁掉）', async () => {
    vi.mocked(terminalOutputStore.load).mockResolvedValue(
      JSON.stringify({ seq: 0, cols: 10, lines: [[{ text: 'abcdefghijklmnopqrst' }]] }),
    );
    // 列数由 clientWidth 换算（jsdom 该值恒为 0），覆写 getter 以便驱动 cols 变化。
    let clientWidth = 80; // cellWidth 8 → cols=10 → 20 字符折成 2 行
    const widthSpy = vi
      .spyOn(Element.prototype, 'clientWidth', 'get')
      .mockImplementation(() => clientWidth);
    try {
      const { rerender } = render(<Harness />);
      await waitFor(() => expect(rowCount()).toBe(3)); // 2 内容行 + 1 分隔行

      clientWidth = 40; // cols=5 → 同一行折成 4 行
      rerender(<Harness />);
      await waitFor(() => expect(rowCount()).toBe(5)); // 4 内容行 + 1 分隔行
    } finally {
      widthSpy.mockRestore();
    }
  });
});
