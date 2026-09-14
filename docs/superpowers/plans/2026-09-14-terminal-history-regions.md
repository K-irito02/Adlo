# 终端面板只读历史区与实时终端区重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把终端面板的「只读历史区」从「单个 xterm 回放 + 覆盖式快照」改成「行模型 + DOM 文本 + 行级虚拟化 + 追加式行块存储」，并给两个区域加上按标签独立的收起/展开与删除/清空能力，外加一个可配置的磁盘预算设置组。

**Architecture:** 写入侧改为**只追加的行块**（每块 ≤ 64 KiB，合成键 `${sessionId}#${seq}` 落在既有 `terminalOutput` IPC 契约上，不改桥接层、不改服务端）；读取侧把行块拼接成「屏幕行序列」，按当前列数折行后用纯 DOM 渲染，行高固定故虚拟化只需整数乘法；分隔符从「写进终端缓冲区的文本」变成独立 DOM 行，整行居中与宽度自适应由 flex 天然满足。

**Tech Stack:** React 18 + TypeScript、Zustand、@xterm/xterm v6、Vitest、Tauri 2.x + Rust（仅一处偏好字段）、SQLite（服务端既有 `terminal_output` 表）

**Spec:** `docs/superpowers/specs/2026-09-14-terminal-history-regions-design.md`

## Global Constraints

- **不新增 IPC**；`tauri-bridge/index.ts`、`preview-bridge/`、`mock-bridge.ts` **均不得改动**。
- **不改服务端**：`crates/server/src/handlers/terminal_output.rs` 的 `MAX_OUTPUT_BYTES = 200 * 1024` 保持不动。
- **不写数据格式兼容 / 旧版本迁移代码**（项目规则：未发布产品禁止）；`normalizeHistoryIndex` 只做边界校验，非法条目直接丢弃。
- 所有 UI 展示文本（含 `aria-label` / `title` / 占位符）**必须走 i18n key**，`zh-CN` 与 `en-US` 的**顶层 key 必须完全一致**（`i18n/__tests__/keys.test.ts` 会校验）。
- 图标**不得内联使用**，一律在 `app/icons/` 中以组件形式导出。
- 常量取值（逐字照抄，不得改数值）：
  - `TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES = 1 << 30`
  - `TERMINAL_HISTORY_BUDGET_FOLLOW_DISK = 0`
  - `TERMINAL_HISTORY_DISK_RESERVE_BYTES = 1 << 30`
  - `TERMINAL_HISTORY_MIN_SEGMENTS_KEPT = 20`
  - `TERMINAL_HISTORY_CHUNK_MAX_BYTES = 64 * 1024`
  - `TERMINAL_CAPTURE_SCROLLBACK_LINES = 5000`
  - `TERMINAL_CAPTURE_THROTTLE_MS = 500`
- 分支命名 kebab-case、≤3 词、无类型前缀（建议 `terminal-history-rework`）；commit 用 Conventional Commit：`type(scope): summary`。
- 每个 Task 先写失败测试再实现（项目强制红绿测试）。
- 除 Task 15 的 `cargo` 命令外，所有命令的工作目录：`ai-digital-life/frontend`。

---

## File Structure

**新建**

| 文件 | 职责 |
|---|---|
| `src/app/features/terminal/historyModel.ts` | `HistoryRun` / `HistoryChunk` 类型、`cellWidthOf`、`wrapLines`、`extractLines`、`resolveRunStyle` |
| `src/app/features/terminal/historyLayout.ts` | `LayoutRow`、`buildLayout`（段 → 块 → 显示行摊平） |
| `src/app/features/terminal/terminalHistoryBudget.ts` | 预算常量、`segmentLines` / `segmentBytes`、`effectiveBudgetBytes`、两级淘汰 |
| `src/app/features/terminal/terminalHistoryCollector.ts` | 行块采集状态机（水位、封块、环回兜底、失败重试），IO 由构造参数注入以便单测 |
| `src/app/features/terminal/terminalRegionCollapse.ts` | 折叠三态类型、归约、持久化读写 |
| `src/app/components/terminal/TerminalHistoryList.tsx` | 虚拟滚动容器、块级懒加载、行区间落位 |
| `src/app/components/terminal/TerminalHistoryRow.tsx` | 渲染单个显示行 |
| `src/app/components/terminal/TerminalHistoryDivider.tsx` | 日期分隔符 DOM 行 |
| `src/app/components/terminal/TerminalRegionActions.tsx` | 区域右上角按钮叠加层 |
| `src/app/features/terminal-settings/TerminalSettings.tsx` | 「终端」设置组 |

**修改**

| 文件 | 改动 |
|---|---|
| `src/app/features/terminal/terminalHistoryStore.ts` | 段结构改为 `chunks: ChunkMeta[]`；新增 `chunkKey`；边界校验扩展 |
| `src/app/features/terminal/terminalOutputStore.ts` | `save()` 检查 `result.ok` 并如实返回成败 |
| `src/app/features/terminal/useTerminalPtyLifecycle.ts` | 采集由尾去抖改节流；接入 collector；暴露 `deleteHistoryForTab` |
| `src/app/features/terminal/terminalXtermPool.ts` | 移除 `SerializeAddon`；采集侧 `scrollback` 提到 5000；导出主题与 cell 度量读取 |
| `src/app/features/terminal/TerminalPanel.tsx` | 两区外壳、折叠判定、叠加层接入、分界线渲染条件 |
| `src/app/features/terminal/useTerminalPanel.ts` | 透出折叠与删除动作 |
| `src/app/components/settings/SettingsNav.tsx` | 注册 `terminal` 组 |
| `src/app/components/settings/SettingsPanel.tsx` | 注册 `terminal` 组组件 |
| `src/app/kernel/types.ts` | `SettingsGroupId` 增加 `'terminal'` |
| `src/app/utils/settingsViewModel.ts` | `terminalHistoryBudgetBytes` 映射 |
| `src/shared/defaultPreferences.ts` | 预算默认值 |
| `src/shared/ipc-types.generated.ts` | `AppPreferencePatch` / `ConfigSnapshot` 增加字段 |
| `src/app/i18n/{zh-CN,en-US}/{terminal,settings}.ts` | 新增文案 |
| `src/app/icons/terminal-nav.tsx` + `src/app/icons/index.ts` | 新增三个图标 |
| `src/styles/regions/rightpanel/terminal-panel.css` | 历史列表 / 行 / 分隔符 / 叠加层样式 |
| `crates/kernel/src/config.rs`、`crates/types/src/types/config.rs`、`crates/server/config/config.json` | 预算偏好字段 |

**删除**

| 文件 | 原因 |
|---|---|
| `src/app/components/terminal/TerminalHistoryView.tsx` | 被 `TerminalHistoryList` 取代 |
| `src/app/features/terminal/terminalHistoryCompose.ts` + 其测试 | 「单 xterm 回放」的光标推进逻辑随架构消失 |
| `@xterm/addon-serialize` 依赖 | 不再需要序列化快照 |

---

## Phase 1 · 数据层

### Task 1: 单元格宽度与按列折行

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/historyModel.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/historyModel.wrap.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `interface HistoryRun { text: string; fg?: number | string; bg?: number | string; bold?: true; italic?: true; underline?: true; dim?: true; inverse?: true }`
  - `cellWidthOf(char: string): 1 | 2`
  - `wrapLines(lines: HistoryRun[][], cols: number): HistoryRun[][]`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/historyModel.wrap.test.ts
import { describe, expect, it } from 'vitest';
import { cellWidthOf, wrapLines } from '../historyModel';

describe('cellWidthOf', () => {
  it('ASCII 计 1 格，CJK 与全角计 2 格', () => {
    expect(cellWidthOf('a')).toBe(1);
    expect(cellWidthOf('中')).toBe(2);
    expect(cellWidthOf('，')).toBe(2);
    expect(cellWidthOf('Ａ')).toBe(2);
  });
});

describe('wrapLines', () => {
  it('不超列时原样保留', () => {
    expect(wrapLines([[{ text: 'abc' }]], 10)).toEqual([[{ text: 'abc' }]]);
  });

  it('正好等于 cols 不折行', () => {
    expect(wrapLines([[{ text: 'abcdefghij' }]], 10)).toEqual([[{ text: 'abcdefghij' }]]);
  });

  it('超出一格时折成两行', () => {
    expect(wrapLines([[{ text: 'abcdefghijk' }]], 10)).toEqual([
      [{ text: 'abcdefghij' }],
      [{ text: 'k' }],
    ]);
  });

  it('宽字符不跨列边界切开，整体推到下一显示行', () => {
    expect(wrapLines([[{ text: '123456789中' }]], 10)).toEqual([
      [{ text: '123456789' }],
      [{ text: '中' }],
    ]);
  });

  it('折行后保留样式', () => {
    expect(wrapLines([[{ text: 'aaaaabbbbb', fg: 1 }]], 5)).toEqual([
      [{ text: 'aaaaa', fg: 1 }],
      [{ text: 'bbbbb', fg: 1 }],
    ]);
  });

  it('空行折行后仍是空行', () => {
    expect(wrapLines([[]], 5)).toEqual([[]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyModel.wrap.test.ts`
Expected: FAIL — `Failed to resolve import "../historyModel"`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/features/terminal/historyModel.ts
/** 一行中的一个同样式片段 */
export interface HistoryRun {
  text: string;
  /** 缺省 = 默认前景；number = 调色板下标 (0–255)；string = 直接颜色 */
  fg?: number | string;
  bg?: number | string;
  bold?: true;
  italic?: true;
  underline?: true;
  dim?: true;
  inverse?: true;
}

/**
 * 单元格宽度判定（东亚宽字符占 2 格）。
 * 口径与 xterm 的 wcwidth 一致；只覆盖终端里常见的宽字符区间，
 * 漏判只会让个别字符错 1 格，不会破坏换行正确性。
 */
export function cellWidthOf(char: string): 1 | 2 {
  const cp = char.codePointAt(0) ?? 0;
  const wide =
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x20000 && cp <= 0x3fffd);
  return wide ? 2 : 1;
}

function explode(runs: HistoryRun[]): { ch: string; width: 1 | 2; run: HistoryRun }[] {
  const cells: { ch: string; width: 1 | 2; run: HistoryRun }[] = [];
  for (const run of runs) {
    for (const ch of run.text) {
      cells.push({ ch, width: cellWidthOf(ch), run });
    }
  }
  return cells;
}

function sameStyle(a: HistoryRun, b: HistoryRun): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.dim === !!b.dim &&
    !!a.inverse === !!b.inverse
  );
}

function implode(cells: { ch: string; run: HistoryRun }[]): HistoryRun[] {
  const out: HistoryRun[] = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (last && sameStyle(last, cell.run)) {
      last.text += cell.ch;
    } else {
      out.push({ ...cell.run, text: cell.ch });
    }
  }
  return out;
}

/**
 * 按列数把屏幕行折成显示行。
 *
 * 为什么自实现而不用 CSS 自动换行：终端是「每 cols 列硬折行」，CSS 会在空格处断行，
 * 两者对不上；而且显示行数不一致会让虚拟化的行偏移与滚动条失真。
 * 宽字符跨列边界时不切开，整体推到下一显示行（与终端行为一致）。
 */
export function wrapLines(lines: HistoryRun[][], cols: number): HistoryRun[][] {
  if (cols <= 0) {
    return lines;
  }
  const out: HistoryRun[][] = [];
  for (const line of lines) {
    let current: { ch: string; run: HistoryRun }[] = [];
    let used = 0;
    for (const cell of explode(line)) {
      if (used + cell.width > cols && current.length > 0) {
        out.push(implode(current));
        current = [];
        used = 0;
      }
      current.push(cell);
      used += cell.width;
    }
    out.push(implode(current));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyModel.wrap.test.ts`
Expected: PASS（6 个用例全绿）

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/historyModel.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/historyModel.wrap.test.ts
git commit -m "feat(terminal): add cell width and column wrapping for history lines"
```

---

### Task 2: 从 xterm 缓冲区提取行模型

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/historyModel.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/historyModel.extract.test.ts`

**Interfaces:**
- Consumes: `HistoryRun`（Task 1）
- Produces:
  - `interface ExtractCell { getChars(): string; getWidth(): number; isFgDefault(): boolean; getFgColor(): number | string; isBgDefault(): boolean; getBgColor(): number | string; isBold(): boolean; isItalic(): boolean; isUnderline(): boolean; isDim(): boolean; isInverse(): boolean }`
  - `interface ExtractLine { getCell(x: number): ExtractCell | undefined }`
  - `interface ExtractSource { activeType: 'normal' | 'alternate'; length: number; getLine(y: number): ExtractLine | undefined }`
  - `extractLines(buffer: { active: ExtractSource; normal: ExtractSource }, fromRow: number, toRow: number): HistoryRun[][]`

> 参数用**结构化接口**而不是 xterm 的 `IBuffer`，是为了让纯逻辑可单测；真实调用处直接传 `terminal.buffer`，其形状满足该接口。

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/historyModel.extract.test.ts
import { describe, expect, it } from 'vitest';
import { extractLines, type ExtractCell, type ExtractLine, type ExtractSource } from '../historyModel';

function cell(ch: string, opts: Partial<ExtractCell> = {}): ExtractCell {
  return {
    getChars: () => ch,
    getWidth: () => (ch === '中' ? 2 : 1),
    isFgDefault: () => opts.isFgDefault?.() ?? true,
    getFgColor: () => opts.getFgColor?.() ?? 0,
    isBgDefault: () => opts.isBgDefault?.() ?? true,
    getBgColor: () => opts.getBgColor?.() ?? 0,
    isBold: () => opts.isBold?.() ?? false,
    isItalic: () => false,
    isUnderline: () => false,
    isDim: () => false,
    isInverse: () => false,
  };
}

function line(cells: ExtractCell[]): ExtractLine {
  return { getCell: (x) => cells[x] };
}

function source(rows: ExtractLine[], type: 'normal' | 'alternate' = 'normal'): ExtractSource {
  return { activeType: type, length: rows.length, getLine: (y) => rows[y] };
}

function buffer(rows: ExtractLine[], type: 'normal' | 'alternate' = 'normal') {
  return { active: source(rows, type), normal: source(rows, 'normal') };
}

describe('extractLines', () => {
  it('把连续同样式单元格合并为一个 run', () => {
    expect(extractLines(buffer([line([cell('a'), cell('b'), cell('c')])]), 0, 1)).toEqual([
      [{ text: 'abc' }],
    ]);
  });

  it('样式变化处切分 run 并记录语义色', () => {
    const rows = [
      line([
        cell('a'),
        cell('b', { isFgDefault: () => false, getFgColor: () => 2 }),
        cell('c', { isFgDefault: () => false, getFgColor: () => 2 }),
      ]),
    ];
    expect(extractLines(buffer(rows), 0, 1)).toEqual([[{ text: 'a' }, { text: 'bc', fg: 2 }]]);
  });

  it('行尾右裁裁掉纯空白', () => {
    expect(extractLines(buffer([line([cell('a'), cell(' '), cell(' ')])]), 0, 1)).toEqual([
      [{ text: 'a' }],
    ]);
  });

  it('保留带非默认背景色的尾部单元格（不丢色块）', () => {
    const rows = [
      line([cell('a'), cell(' ', { isBgDefault: () => false, getBgColor: () => 4 })]),
    ];
    expect(extractLines(buffer(rows), 0, 1)).toEqual([[{ text: 'a' }, { text: ' ', bg: 4 }]]);
  });

  it('只返回给定行区间，空行保留为空数组', () => {
    const rows = [line([cell('a')]), line([]), line([cell('c')])];
    expect(extractLines(buffer(rows), 1, 3)).toEqual([[], [{ text: 'c' }]]);
  });

  it('备用缓冲区激活时改取 normal', () => {
    expect(extractLines(buffer([line([cell('n')])], 'alternate'), 0, 1)).toEqual([[{ text: 'n' }]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyModel.extract.test.ts`
Expected: FAIL — `extractLines is not a function`

- [ ] **Step 3: Write minimal implementation**

追加到 `historyModel.ts`：

```ts
export interface ExtractCell {
  getChars(): string;
  getWidth(): number;
  isFgDefault(): boolean;
  getFgColor(): number | string;
  isBgDefault(): boolean;
  getBgColor(): number | string;
  isBold(): boolean;
  isItalic(): boolean;
  isUnderline(): boolean;
  isDim(): boolean;
  isInverse(): boolean;
}

export interface ExtractLine {
  getCell(x: number): ExtractCell | undefined;
}

export interface ExtractSource {
  activeType: 'normal' | 'alternate';
  length: number;
  getLine(y: number): ExtractLine | undefined;
}

function styleOf(cell: ExtractCell): Omit<HistoryRun, 'text'> {
  const style: Omit<HistoryRun, 'text'> = {};
  if (!cell.isFgDefault()) {
    style.fg = cell.getFgColor();
  }
  if (!cell.isBgDefault()) {
    style.bg = cell.getBgColor();
  }
  if (cell.isBold()) {
    style.bold = true;
  }
  if (cell.isItalic()) {
    style.italic = true;
  }
  if (cell.isUnderline()) {
    style.underline = true;
  }
  if (cell.isDim()) {
    style.dim = true;
  }
  if (cell.isInverse()) {
    style.inverse = true;
  }
  return style;
}

/** 行尾右裁：从末尾去掉「空白且无背景色」的 run，但保留带背景色的单元格 */
function trimTrailingBlank(runs: HistoryRun[]): HistoryRun[] {
  const kept = runs.slice();
  while (kept.length > 0) {
    const last = kept[kept.length - 1];
    if (last.bg === undefined) {
      const trimmed = last.text.replace(/ +$/, '');
      if (trimmed === '') {
        kept.pop();
        continue;
      }
      if (trimmed !== last.text) {
        kept[kept.length - 1] = { ...last, text: trimmed };
      }
    }
    break;
  }
  return kept;
}

/**
 * 提取 `[fromRow, toRow)` 的行模型。
 *
 * - 备用缓冲区（vim/less）不进入历史：改读 `normal`，延续既有结论。
 * - 返回数组与请求区间一一对应，**空行保留为空数组**，行数信息不能丢。
 */
export function extractLines(
  buffer: { active: ExtractSource; normal: ExtractSource },
  fromRow: number,
  toRow: number,
): HistoryRun[][] {
  const source = buffer.active.activeType === 'alternate' ? buffer.normal : buffer.active;
  const out: HistoryRun[][] = [];
  for (let y = Math.max(0, fromRow); y < Math.min(toRow, source.length); y += 1) {
    const line = source.getLine(y);
    const runs: HistoryRun[] = [];
    if (line) {
      for (let x = 0; ; x += 1) {
        const cell = line.getCell(x);
        if (!cell) {
          break;
        }
        const style = styleOf(cell);
        const last = runs[runs.length - 1];
        if (last && sameStyle(last, style as HistoryRun)) {
          last.text += cell.getChars();
        } else {
          runs.push({ ...style, text: cell.getChars() });
        }
      }
    }
    out.push(trimTrailingBlank(runs));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyModel.extract.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/historyModel.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/historyModel.extract.test.ts
git commit -m "feat(terminal): extract history line model from xterm buffer"
```

---

### Task 3: 行块类型与索引边界校验

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/historyModel.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/terminalHistoryStore.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryStore.test.ts`

**Interfaces:**
- Consumes: `HistoryRun`（Task 1）
- Produces:
  - `interface HistoryChunk { seq: number; cols: number; lines: HistoryRun[][] }`（在 `historyModel.ts`）
  - `interface TerminalHistoryChunkMeta { lines: number; size: number }`（在 `terminalHistoryStore.ts`）
  - `interface TerminalHistorySegment { sessionId: string; endedAt: number; live: boolean; chunks: TerminalHistoryChunkMeta[] }`
  - `chunkKey(sessionId: string, seq: number): string`
  - `normalizeHistoryIndex(raw: unknown): Record<string, TerminalHistorySegment[]>`
  - `TERMINAL_HISTORY_INDEX_KEY`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/terminalHistoryStore.test.ts
import { describe, expect, it } from 'vitest';
import { chunkKey, normalizeHistoryIndex } from '../terminalHistoryStore';

describe('normalizeHistoryIndex', () => {
  it('保留结构完整的段', () => {
    const raw = {
      tab1: [{ sessionId: 's1', endedAt: 1, live: false, chunks: [{ lines: 3, size: 100 }] }],
    };
    expect(normalizeHistoryIndex(raw)).toEqual(raw);
  });

  it('丢弃 endedAt 非有限数的条目', () => {
    expect(normalizeHistoryIndex({ tab1: [{ sessionId: 's1', endedAt: NaN, live: false, chunks: [] }] })).toEqual({});
  });

  it('丢弃缺 chunks 或 chunks 结构非法的条目', () => {
    const raw = {
      tab1: [
        { sessionId: 's1', endedAt: 1, live: false },
        { sessionId: 's2', endedAt: 1, live: false, chunks: [{ lines: 'x', size: 1 }] },
      ],
    };
    expect(normalizeHistoryIndex(raw)).toEqual({});
  });

  it('丢弃非法标签条目', () => {
    expect(normalizeHistoryIndex({ tab1: 'nope', tab2: null })).toEqual({});
  });
});

describe('chunkKey', () => {
  it('用合成键承载「一段多块」，不改 IPC 契约', () => {
    expect(chunkKey('s1', 0)).toBe('s1#0');
    expect(chunkKey('s1', 12)).toBe('s1#12');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalHistoryStore.test.ts`
Expected: FAIL — `chunkKey is not a function`

- [ ] **Step 3: Write minimal implementation**

追加到 `historyModel.ts`：

```ts
/** 一个行块：一次追加写入的最小单位 */
export interface HistoryChunk {
  /** 块序号，从 0 起，按序拼接成一个段 */
  seq: number;
  /** 提取时的列数，作为折行基准 */
  cols: number;
  /** 本块包含的屏幕行，旧 → 新 */
  lines: HistoryRun[][];
}
```

改写 `terminalHistoryStore.ts`：

```ts
import { makePersistedWriter, readJson } from '@stores/storageHelpers';

/**
 * 按**标签 id** 持久化「历史分段索引」：该标签历次 PTY 会话的 sessionId 列表（旧 → 新）。
 * 每段的行内容按**行块**存储，键为 `${sessionId}#${seq}`，值为 `HistoryChunk` 的 JSON。
 * 本索引只记录「有过哪些段、顺序如何、何时结束、每块的体积与行数」。
 */
export const TERMINAL_HISTORY_INDEX_KEY = 'adl-terminal:history-index';

/** 单个行块的元信息 */
export interface TerminalHistoryChunkMeta {
  /** 该块采集时的屏幕行数 */
  lines: number;
  /** 该块 JSON 的 UTF-8 字节数 */
  size: number;
}

/** 一段历史：一次已结束的 PTY 会话 */
export interface TerminalHistorySegment {
  sessionId: string;
  /** 该会话最后一次有活动的时刻；分隔符显示它 */
  endedAt: number;
  /** true = 会话仍在进行中 → 只读历史区不渲染它 */
  live: boolean;
  /** 每块的元信息，**下标即 seq**；段的总行数与总体积都是它的聚合值 */
  chunks: TerminalHistoryChunkMeta[];
}

/** 块级存储键：复用既有 `terminalOutput` 的 `sessionId: string` 契约，不新增 IPC */
export function chunkKey(sessionId: string, seq: number): string {
  return `${sessionId}#${seq}`;
}

const scheduleWrite = makePersistedWriter(TERMINAL_HISTORY_INDEX_KEY);

function isChunkMeta(value: unknown): value is TerminalHistoryChunkMeta {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const meta = value as TerminalHistoryChunkMeta;
  return (
    typeof meta.lines === 'number' &&
    Number.isFinite(meta.lines) &&
    typeof meta.size === 'number' &&
    Number.isFinite(meta.size)
  );
}

/**
 * 归一化持久化读出的索引：丢弃结构非法的标签条目与段条目。
 * 只做**边界校验**，不做旧格式迁移（项目规则：未发布产品禁止兼容层）。
 */
export function normalizeHistoryIndex(raw: unknown): Record<string, TerminalHistorySegment[]> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const result: Record<string, TerminalHistorySegment[]> = {};
  for (const [tabId, value] of Object.entries(source)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const segments = value.filter((segment): segment is TerminalHistorySegment => {
      if (!segment || typeof segment !== 'object') {
        return false;
      }
      const s = segment as TerminalHistorySegment;
      return (
        typeof s.sessionId === 'string' &&
        typeof s.endedAt === 'number' &&
        Number.isFinite(s.endedAt) &&
        typeof s.live === 'boolean' &&
        Array.isArray(s.chunks) &&
        s.chunks.every(isChunkMeta)
      );
    });
    if (segments.length > 0) {
      result[tabId] = segments;
    }
  }
  return result;
}

export const terminalHistoryStore = {
  loadAll(): Record<string, TerminalHistorySegment[]> {
    return normalizeHistoryIndex(readJson<unknown>(TERMINAL_HISTORY_INDEX_KEY, {}));
  },
  saveAll(map: Record<string, TerminalHistorySegment[]>): void {
    scheduleWrite(map);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalHistoryStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/historyModel.ts ai-digital-life/frontend/src/app/features/terminal/terminalHistoryStore.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryStore.test.ts
git commit -m "feat(terminal): add history chunk types and index boundary validation"
```

---

### Task 4: 让保存失败不再被吞掉

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/terminalOutputStore.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalOutputStore.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `terminalOutputStore.save(sessionId, output): Promise<boolean>` —— **语义收紧**：`result.ok === false` 时返回 `false`（此前一律返回 `true`）

**为什么这个改动不能省：** 服务端业务错误**不抛异常**（`httpBridge.call()` 返回 `{ok:false}`），而 `save()` 只 `catch` 异常、调用方又丢弃返回值 —— 三层全静默，历史会「静默截断」。这是后续 `appendChunk` 判断是否推进水位的前提。

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/terminalOutputStore.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terminalOutputStore } from '../terminalOutputStore';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('terminalOutputStore.save', () => {
  it('服务端返回 ok:false 时返回 false（而非静默成功）', async () => {
    vi.stubGlobal('window', {
      digitalLife: {
        terminalOutput: {
          save: async () => ({ ok: false, error: { code: 'INVALID_INPUT', message: 'too large' } }),
        },
      },
    });
    await expect(terminalOutputStore.save('s1', 'x')).resolves.toBe(false);
  });

  it('ok:true 时返回 true', async () => {
    vi.stubGlobal('window', {
      digitalLife: { terminalOutput: { save: async () => ({ ok: true, data: undefined }) } },
    });
    await expect(terminalOutputStore.save('s1', 'x')).resolves.toBe(true);
  });

  it('抛异常时返回 false', async () => {
    vi.stubGlobal('window', {
      digitalLife: {
        terminalOutput: {
          save: async () => {
            throw new Error('network down');
          },
        },
      },
    });
    await expect(terminalOutputStore.save('s1', 'x')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalOutputStore.test.ts`
Expected: FAIL — 第一个用例得到 `true`

- [ ] **Step 3: Write minimal implementation**

```ts
export const terminalOutputStore = {
  /** 保存会话输出；返回是否成功（采集器据它决定是否推进水位） */
  async save(sessionId: string, output: string): Promise<boolean> {
    try {
      // 必须检查 result.ok：业务错误（如体积超限）不会抛异常，
      // 只看 catch 会把「服务端拒绝」误判成「保存成功」，历史静默截断。
      const result = await window.digitalLife.terminalOutput.save(sessionId, output);
      if (!result.ok) {
        console.warn('terminalOutputStore: save rejected:', result.error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('terminalOutputStore: save failed:', err);
      return false;
    }
  },

  async load(sessionId: string): Promise<string | null> {
    try {
      const result = await window.digitalLife.terminalOutput.load(sessionId);
      if (result.ok) {
        return result.data;
      }
      return null;
    } catch (err) {
      console.warn('terminalOutputStore: load failed:', err);
      return null;
    }
  },

  async delete(sessionId: string): Promise<void> {
    try {
      await window.digitalLife.terminalOutput.delete(sessionId);
    } catch (err) {
      console.warn('terminalOutputStore: delete failed:', err);
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalOutputStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalOutputStore.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalOutputStore.test.ts
git commit -m "fix(terminal): surface rejected history saves instead of swallowing them"
```

---

### Task 5: 预算常量与两级淘汰

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/terminalHistoryBudget.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryBudget.test.ts`

**Interfaces:**
- Consumes: `TerminalHistorySegment`（Task 3）
- Produces:
  - 常量：`TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES`、`TERMINAL_HISTORY_BUDGET_FOLLOW_DISK`、`TERMINAL_HISTORY_DISK_RESERVE_BYTES`、`TERMINAL_HISTORY_MIN_SEGMENTS_KEPT`
  - `segmentLines(seg: TerminalHistorySegment): number`、`segmentBytes(seg: TerminalHistorySegment): number`
  - `effectiveBudgetBytes(settingBytes: number, diskAvailableBytes: number | null): number`
  - `selectSegmentsToEvict(segments: { tabId: string; seg: TerminalHistorySegment }[], budgetBytes: number): { tabId: string; sessionId: string }[]`
  - `selectLeadingChunksToEvict(oldest: TerminalHistorySegment, overflowBytes: number): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/terminalHistoryBudget.test.ts
import { describe, expect, it } from 'vitest';
import {
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
  TERMINAL_HISTORY_DISK_RESERVE_BYTES,
  TERMINAL_HISTORY_MIN_SEGMENTS_KEPT,
  effectiveBudgetBytes,
  segmentBytes,
  segmentLines,
  selectLeadingChunksToEvict,
  selectSegmentsToEvict,
} from '../terminalHistoryBudget';
import type { TerminalHistorySegment } from '../terminalHistoryStore';

function seg(endedAt: number, sizes: number[], live = false): TerminalHistorySegment {
  return {
    sessionId: `s${endedAt}`,
    endedAt,
    live,
    chunks: sizes.map((size) => ({ lines: 1, size })),
  };
}

describe('segmentLines / segmentBytes', () => {
  it('聚合值等于 chunks 之和', () => {
    const s: TerminalHistorySegment = {
      sessionId: 's',
      endedAt: 1,
      live: false,
      chunks: [
        { lines: 3, size: 10 },
        { lines: 5, size: 20 },
      ],
    };
    expect(segmentLines(s)).toBe(8);
    expect(segmentBytes(s)).toBe(30);
  });
});

describe('effectiveBudgetBytes', () => {
  it('固定预算模式直接返回设定值', () => {
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES, 10 ** 12)).toBe(
      TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
    );
  });

  it('跟随磁盘模式预留安全余量', () => {
    const disk = 5 * TERMINAL_HISTORY_DISK_RESERVE_BYTES;
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_FOLLOW_DISK, disk)).toBe(
      disk - TERMINAL_HISTORY_DISK_RESERVE_BYTES,
    );
  });

  it('磁盘可用空间低于余量时下限为 0；拿不到磁盘信息时回退默认预算', () => {
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_FOLLOW_DISK, 1)).toBe(0);
    expect(effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_FOLLOW_DISK, null)).toBe(
      TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
    );
  });
});

describe('selectSegmentsToEvict', () => {
  it('未超预算时不淘汰', () => {
    const list = [
      { tabId: 't1', seg: seg(1, [100]) },
      { tabId: 't1', seg: seg(2, [100]) },
    ];
    expect(selectSegmentsToEvict(list, 1000)).toEqual([]);
  });

  it('超预算时按 endedAt 从最旧开始淘汰', () => {
    const list = [
      { tabId: 't1', seg: seg(3, [400]) },
      { tabId: 't1', seg: seg(1, [400]) },
      { tabId: 't1', seg: seg(2, [400]) },
    ];
    expect(selectSegmentsToEvict(list, 500)).toEqual([
      { tabId: 't1', sessionId: 's1' },
      { tabId: 't1', sessionId: 's2' },
    ]);
  });

  it('跳过进行中的段', () => {
    const list = [
      { tabId: 't1', seg: seg(1, [900], true) },
      { tabId: 't1', seg: seg(2, [900]) },
    ];
    expect(selectSegmentsToEvict(list, 100)).toEqual([{ tabId: 't1', sessionId: 's2' }]);
  });

  it('至少保留最近 20 段，即使仍然超预算', () => {
    const list = Array.from({ length: TERMINAL_HISTORY_MIN_SEGMENTS_KEPT }, (_, i) => ({
      tabId: 't1',
      seg: seg(i + 1, [1000]),
    }));
    expect(selectSegmentsToEvict(list, 1)).toEqual([]);
  });
});

describe('selectLeadingChunksToEvict', () => {
  it('从头部累计，够用即停', () => {
    expect(selectLeadingChunksToEvict(seg(1, [10, 20, 40, 80]), 25)).toBe(2);
  });

  it('至少保留最后一块', () => {
    expect(selectLeadingChunksToEvict(seg(1, [10, 20]), 10 ** 9)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalHistoryBudget.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/features/terminal/terminalHistoryBudget.ts
import type { TerminalHistorySegment } from './terminalHistoryStore';

export const TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES = 1 << 30;
export const TERMINAL_HISTORY_BUDGET_FOLLOW_DISK = 0;
export const TERMINAL_HISTORY_DISK_RESERVE_BYTES = 1 << 30;
export const TERMINAL_HISTORY_MIN_SEGMENTS_KEPT = 20;

export function segmentLines(seg: TerminalHistorySegment): number {
  return seg.chunks.reduce((sum, c) => sum + c.lines, 0);
}

export function segmentBytes(seg: TerminalHistorySegment): number {
  return seg.chunks.reduce((sum, c) => sum + c.size, 0);
}

/**
 * 有效预算。
 * settingBytes === 0 表示「跟随磁盘剩余空间」：预算 = 磁盘可用 − 1 GiB 安全余量，下限 0。
 * 拿不到磁盘信息（null）时回退默认预算，不阻塞结算。
 */
export function effectiveBudgetBytes(
  settingBytes: number,
  diskAvailableBytes: number | null,
): number {
  if (settingBytes !== TERMINAL_HISTORY_BUDGET_FOLLOW_DISK) {
    return settingBytes;
  }
  if (diskAvailableBytes === null) {
    return TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
  }
  return Math.max(0, diskAvailableBytes - TERMINAL_HISTORY_DISK_RESERVE_BYTES);
}

/**
 * 一级淘汰：按 endedAt 升序（最旧优先）逐段删除，直到剩余总量 ≤ 预算。
 * 只作用于已结束的段；**总是跳过最近 20 段**（安全阀，避免磁盘将满时清空历史）。
 *
 * 为什么按段而不是按块：按块淘汰会让「一段历史只剩后半截」变成常态，
 * 而这正是本次要消除的现象形态。
 */
export function selectSegmentsToEvict(
  segments: { tabId: string; seg: TerminalHistorySegment }[],
  budgetBytes: number,
): { tabId: string; sessionId: string }[] {
  const ended = segments
    .filter((s) => !s.seg.live)
    .slice()
    .sort((a, b) => a.seg.endedAt - b.seg.endedAt);
  const evictable = ended.slice(0, Math.max(0, ended.length - TERMINAL_HISTORY_MIN_SEGMENTS_KEPT));

  let total = segments.reduce((sum, s) => sum + segmentBytes(s.seg), 0);
  const out: { tabId: string; sessionId: string }[] = [];
  for (const entry of evictable) {
    if (total <= budgetBytes) {
      break;
    }
    total -= segmentBytes(entry.seg);
    out.push({ tabId: entry.tabId, sessionId: entry.seg.sessionId });
  }
  return out;
}

/**
 * 二级淘汰（最后手段）：一级淘汰后仍超预算（单段自身就很大），
 * 对最旧段从头部丢弃若干块。**至少保留最后一块**，不允许把一段清空成零块。
 */
export function selectLeadingChunksToEvict(
  oldest: TerminalHistorySegment,
  overflowBytes: number,
): number {
  let freed = 0;
  let dropped = 0;
  const max = Math.max(0, oldest.chunks.length - 1);
  while (dropped < max && freed < overflowBytes) {
    freed += oldest.chunks[dropped].size;
    dropped += 1;
  }
  return dropped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalHistoryBudget.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalHistoryBudget.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryBudget.test.ts
git commit -m "feat(terminal): add history budget constants and two-level eviction"
```

---

### Task 6: 行块采集状态机（水位 / 封块 / 环回兜底 / 失败重试）

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/terminalHistoryCollector.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryCollector.test.ts`

**Interfaces:**
- Consumes: `HistoryChunk`、`extractLines`、`HistoryRun`、`ExtractLine`（Task 1–3）、`chunkKey`、`TerminalHistoryChunkMeta`（Task 3）
- Produces:
  - `const TERMINAL_HISTORY_CHUNK_MAX_BYTES = 64 * 1024`
  - `const TERMINAL_CAPTURE_SCROLLBACK_LINES = 5000`
  - `const TERMINAL_CAPTURE_THROTTLE_MS = 500`
  - `interface BufferSnapshot { length: number; baseY: number; activeType: 'normal' | 'alternate'; getLine(y: number): ExtractLine | undefined }`
  - `class TerminalHistoryCollector`，构造 `{ readBuffer: () => BufferSnapshot; cols: () => number; write: (key: string, payload: string) => Promise<boolean> }`
  - 方法：`setSessionId(id)`、`collect(): Promise<boolean>`、`flush(): Promise<boolean>`、`getWrittenChunks(): TerminalHistoryChunkMeta[]`、`needsRebuild(): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/terminalHistoryCollector.test.ts
import { describe, expect, it } from 'vitest';
import {
  TERMINAL_HISTORY_CHUNK_MAX_BYTES,
  TerminalHistoryCollector,
} from '../terminalHistoryCollector';
import type { ExtractCell } from '../historyModel';

function cell(ch: string): ExtractCell {
  return {
    getChars: () => ch,
    getWidth: () => 1,
    isFgDefault: () => true,
    getFgColor: () => 0,
    isBgDefault: () => true,
    getBgColor: () => 0,
    isBold: () => false,
    isItalic: () => false,
    isUnderline: () => false,
    isDim: () => false,
    isInverse: () => false,
  };
}

/** 造一个「前 frozen 行冻结、后 viewport 行可变」的缓冲 */
function makeBuffer(frozen: string[], viewport: string[]) {
  const all = [...frozen, ...viewport];
  const getLine = (y?: number) =>
    y === undefined || all[y] === undefined
      ? undefined
      : { getCell: (x: number) => (x === 0 ? cell(all[y]) : undefined) };
  return { length: all.length, baseY: frozen.length, activeType: 'normal' as const, getLine };
}

function makeCollector(
  buffer: ReturnType<typeof makeBuffer>,
  written: Record<string, string>,
  sessionId = 's',
) {
  const collector = new TerminalHistoryCollector({
    readBuffer: () => buffer,
    cols: () => 10,
    write: async (key, payload) => {
      written[key] = payload;
      return true;
    },
  });
  collector.setSessionId(sessionId);
  return collector;
}

describe('TerminalHistoryCollector', () => {
  it('collect 只采冻结行，视口区不采；flush 把视口也封入最后一块', async () => {
    const written: Record<string, string> = {};
    const c = makeCollector(makeBuffer(['a', 'b'], ['v1', 'v2']), written);
    await c.collect();
    expect(Object.keys(written)).toEqual([]); // 未满一块，不落盘

    await c.flush();
    expect(Object.keys(written)).toEqual(['s#0']);
    expect(JSON.parse(written['s#0']).lines).toEqual([
      [{ text: 'a' }],
      [{ text: 'b' }],
      [{ text: 'v1' }],
      [{ text: 'v2' }],
    ]);
  });

  it('累计超过块上限时封块并递增 seq', async () => {
    const written: Record<string, string> = {};
    const bigLine = 'x'.repeat(2048);
    const frozen = Array.from({ length: 100 }, () => bigLine);
    const c = makeCollector(makeBuffer(frozen, []), written);
    await c.collect();
    expect(Object.keys(written).length).toBeGreaterThan(1);
    expect(Object.keys(written)[0]).toBe('s#0');
    expect(Object.keys(written)[1]).toBe('s#1');
    for (const payload of Object.values(written)) {
      expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(
        TERMINAL_HISTORY_CHUNK_MAX_BYTES,
      );
    }
  });

  it('写入失败时不推进水位，下一次 collect 重试同一批行', async () => {
    let attempts = 0;
    const received: string[] = [];
    const collector = new TerminalHistoryCollector({
      readBuffer: () => makeBuffer(['a'], []),
      cols: () => 10,
      write: async (_key, payload) => {
        attempts += 1;
        received.push(payload);
        return attempts > 1;
      },
    });
    collector.setSessionId('s');
    await collector.flush();
    expect(attempts).toBe(1);
    await collector.flush();
    expect(attempts).toBe(2);
    expect(received[1]).toContain('"a"');
  });

  it('水位失效（行数缩水）时清空已落盘块并要求重建整段', async () => {
    const written: Record<string, string> = {};
    const big = makeBuffer(Array.from({ length: 40 }, () => 'x'.repeat(2048)), []);
    const c = makeCollector(big, written);
    await c.collect();
    expect(c.getWrittenChunks().length).toBeGreaterThan(1);

    // 模拟 scrollback 被裁剪：总行数与 baseY 同时缩水到水位之下
    const shrunk = { length: 1, baseY: 0, activeType: 'normal' as const, getLine: () => undefined };
    const c2 = new TerminalHistoryCollector({
      readBuffer: () => shrunk,
      cols: () => 10,
      write: async (key, payload) => {
        written[key] = payload;
        return true;
      },
    });
    c2.setSessionId('s');
    await c2.flush();
    expect(c2.needsRebuild()).toBe(true);
    expect(c2.getWrittenChunks().length).toBe(0);
  });

  it('块上限常量取自设计（64 KiB）', () => {
    expect(TERMINAL_HISTORY_CHUNK_MAX_BYTES).toBe(64 * 1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalHistoryCollector.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/features/terminal/terminalHistoryCollector.ts
import { extractLines, type ExtractLine, type ExtractSource, type HistoryRun } from './historyModel';
import { chunkKey, type TerminalHistoryChunkMeta } from './terminalHistoryStore';

export const TERMINAL_HISTORY_CHUNK_MAX_BYTES = 64 * 1024;
export const TERMINAL_CAPTURE_SCROLLBACK_LINES = 5000;
export const TERMINAL_CAPTURE_THROTTLE_MS = 500;

export interface BufferSnapshot {
  length: number;
  baseY: number;
  activeType: 'normal' | 'alternate';
  getLine(y: number): ExtractLine | undefined;
}

interface CollectorDeps {
  readBuffer: () => BufferSnapshot;
  cols: () => number;
  /** 返回是否写入成功；实现处应检查 IpcResult.ok（见 terminalOutputStore.save） */
  write: (key: string, payload: string) => Promise<boolean>;
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 行块采集状态机：把「已冻结的屏幕行」按块追加落盘。
 *
 * 三条不变量：
 * 1. **只追加**：块一旦落盘就不再重写，因此后续写入不可能损坏已保存的内容。
 * 2. **单次写入体积有界**：由「两次采集之间新增的行数」决定，撞不到任何体积上限
 *    —— 这是「超出上限被拒收」被结构性消除的原因，而不是把阈值调大。
 * 3. **成功才推进水位**：写入失败时保留未满块与水位，下一次采集重试同一批行。
 *
 * 环回兜底：scrollback 溢出会裁掉最旧行、绝对行号失效。此时清空已落盘块，
 * 由调用方以当前缓冲区内容重建整段 —— 否则会写出错位的历史，比丢失更难排查。
 */
export class TerminalHistoryCollector {
  private sessionId = '';
  private watermark = 0;
  private pending: HistoryRun[][] = [];
  private pendingBytes = 0;
  private written: TerminalHistoryChunkMeta[] = [];
  private seq = 0;
  private rebuilt = false;

  constructor(private readonly deps: CollectorDeps) {}

  /** 绑定会话并重置全部状态（每建一个新会话都要调用） */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.watermark = 0;
    this.pending = [];
    this.pendingBytes = 0;
    this.written = [];
    this.seq = 0;
    this.rebuilt = false;
  }

  getWrittenChunks(): TerminalHistoryChunkMeta[] {
    return this.written.slice();
  }

  needsRebuild(): boolean {
    return this.rebuilt;
  }

  /** 采集：把 [watermark, baseY) 的冻结行并入当前块，写满即封块 */
  async collect(): Promise<boolean> {
    const buffer = this.deps.readBuffer();
    this.detectRewind(buffer);
    const frozenEnd = buffer.activeType === 'alternate' ? buffer.baseY : buffer.baseY;
    return this.append(buffer, frozenEnd);
  }

  /** 定稿：把视口区也封入最后一块（会话已结束，视口不再变化） */
  async flush(): Promise<boolean> {
    const buffer = this.deps.readBuffer();
    this.detectRewind(buffer);
    const ok = await this.append(buffer, buffer.length);
    if (ok) {
      await this.seal();
    }
    return ok;
  }

  private detectRewind(buffer: BufferSnapshot): void {
    if (this.watermark > 0 && buffer.length < this.watermark) {
      this.rebuilt = true;
      this.watermark = 0;
      this.pending = [];
      this.pendingBytes = 0;
      this.written = [];
      this.seq = 0;
    }
  }

  private async append(buffer: BufferSnapshot, toRow: number): Promise<boolean> {
    if (toRow <= this.watermark) {
      return true;
    }
    const rows = extractLines(
      { active: buffer as unknown as ExtractSource, normal: buffer as unknown as ExtractSource },
      this.watermark,
      toRow,
    );
    for (const line of rows) {
      const lineBytes = utf8Length(JSON.stringify(line));
      if (
        this.pending.length > 0 &&
        this.pendingBytes + lineBytes > TERMINAL_HISTORY_CHUNK_MAX_BYTES
      ) {
        if (!(await this.seal())) {
          return false;
        }
      }
      this.pending.push(line);
      this.pendingBytes += lineBytes;
    }
    if (!(await this.seal())) {
      return false;
    }
    this.watermark = toRow;
    return true;
  }

  /** 把 pending 落盘为一个块；成功返回 true 并推进 seq，失败保留 pending 供重试 */
  private async seal(): Promise<boolean> {
    if (this.pending.length === 0) {
      return true;
    }
    const payload = JSON.stringify({
      seq: this.seq,
      cols: this.deps.cols(),
      lines: this.pending,
    });
    const ok = await this.deps.write(chunkKey(this.sessionId, this.seq), payload);
    if (!ok) {
      return false;
    }
    this.written.push({ lines: this.pending.length, size: utf8Length(payload) });
    this.seq += 1;
    this.pending = [];
    this.pendingBytes = 0;
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalHistoryCollector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalHistoryCollector.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryCollector.test.ts
git commit -m "feat(terminal): add append-only history chunk collector"
```

---

### Task 7: 接入 PTY 生命周期（节流采集 / 建档 / 定稿 / 删除）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/terminalXtermPool.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalCaptureThrottle.test.ts`

**Interfaces:**
- Consumes: `TerminalHistoryCollector`（Task 6）、`chunkKey`（Task 3）、`segmentBytes` / `selectSegmentsToEvict` / `effectiveBudgetBytes`（Task 5）
- Produces:
  - `createThrottledRunner(run: () => void, intervalMs: number): () => void`（自 `useTerminalPtyLifecycle.ts` 导出，供单测）
  - `useTerminalPtyLifecycle` 返回值新增 `deleteHistoryForTab(tabId: string): Promise<void>`
  - `historySegments` 语义不变（已过滤 `live === false`，旧 → 新）

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/terminalCaptureThrottle.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThrottledRunner } from '../useTerminalPtyLifecycle';

afterEach(() => {
  vi.useRealTimers();
});

describe('createThrottledRunner', () => {
  it('连续触发期间按固定间隔执行，而不是被不断重置（尾去抖的替代）', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const trigger = createThrottledRunner(run, 500);

    // 模拟连续输出：每 100ms 触发一次，共 2000ms
    for (let i = 0; i < 20; i += 1) {
      trigger();
      vi.advanceTimersByTime(100);
    }
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(run.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('空闲后仍会补执行一次（保证最后一次输出落盘）', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const trigger = createThrottledRunner(run, 500);
    trigger();
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('第一次触发立即执行', () => {
    const run = vi.fn();
    const trigger = createThrottledRunner(run, 500);
    trigger();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalCaptureThrottle.test.ts`
Expected: FAIL — `createThrottledRunner is not a function`

- [ ] **Step 3: Implement the throttle and wire the lifecycle**

在 `useTerminalPtyLifecycle.ts` 中导出节流器：

```ts
/**
 * 节流执行器：**替代原来的尾去抖**。
 *
 * 为什么必须换：尾去抖在持续输出时每来一个事件就重置定时器，定时器永不触发，
 * 只能靠 30 秒周期兜底 —— 那 30 秒里的输出可能已超出 xterm scrollback 环而从源头丢失。
 * 节流保证「输出期间最多每 intervalMs 采一次」，把积压行数压到远小于环容量。
 */
export function createThrottledRunner(run: () => void, intervalMs: number): () => void {
  let lastRanAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    const now = Date.now();
    const elapsed = now - lastRanAt;
    if (elapsed >= intervalMs) {
      lastRanAt = now;
      run();
      return;
    }
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      lastRanAt = Date.now();
      run();
    }, intervalMs - elapsed);
  };
}
```

接入采集器与索引更新（放在 `useTerminalPtyLifecycle` 内，替换原 `serializeSession` / 尾去抖 / `archiveSessionAsHistory` / `clearHistoryForTab`）：

```ts
const collectorsRef = useRef<Map<string, TerminalHistoryCollector>>(new Map());
const throttledRef = useRef<Map<string, () => void>>(new Map());

const collectorFor = useCallback((sessionId: string) => {
  let collector = collectorsRef.current.get(sessionId);
  if (!collector) {
    collector = new TerminalHistoryCollector({
      readBuffer: () => {
        const entry = terminalXtermPool.get(sessionId);
        const buffer = entry?.terminal.buffer;
        return {
          length: buffer?.active.length ?? 0,
          baseY: buffer?.active.baseY ?? 0,
          activeType: buffer?.active.type === 'alternate' ? 'alternate' : 'normal',
          getLine: (y) => buffer?.active.getLine(y) as unknown as ExtractLine | undefined,
        };
      },
      cols: () => terminalXtermPool.get(sessionId)?.terminal.cols ?? 80,
      write: (key, payload) => terminalOutputStore.save(key, payload),
    });
    collector.setSessionId(sessionId);
    collectorsRef.current.set(sessionId, collector);
  }
  return collector;
}, []);

/** 采集一次 → 把块的元信息写回索引 → 结算预算 */
const persistCollectedChunks = useCallback(
  async (sessionId: string) => {
    const collector = collectorFor(sessionId);
    const ok = await collector.collect();
    if (!ok) {
      return; // 失败：水位未推进，未满块保留，下一次采集重试
    }
    ensureHistoryIndexLoaded();
    const tab = useAppStore.getState().terminalTabs.find((t) => t.sessionId === sessionId);
    if (!tab) {
      return;
    }
    const segments = historyIndexRef.current.get(tab.id) ?? [];
    const at = segments.findIndex((s) => s.sessionId === sessionId);
    const next: TerminalHistorySegment = {
      sessionId,
      endedAt: Date.now(),
      live: true,
      chunks: collector.getWrittenChunks(),
    };
    if (at >= 0) {
      segments[at] = next;
    } else {
      segments.push(next);
    }
    historyIndexRef.current.set(tab.id, segments);
    persistHistoryIndex();
    settleHistoryBudget();
  },
  [collectorFor, ensureHistoryIndexLoaded, persistHistoryIndex, settleHistoryBudget],
);

/** 输出驱动的采集入口（节流） */
const collectThrottled = useCallback(
  (sessionId: string) => {
    let trigger = throttledRef.current.get(sessionId);
    if (!trigger) {
      trigger = createThrottledRunner(
        () => void persistCollectedChunks(sessionId),
        TERMINAL_CAPTURE_THROTTLE_MS,
      );
      throttledRef.current.set(sessionId, trigger);
    }
    trigger();
  },
  [persistCollectedChunks],
);
```

把 `subscribePtyOutput` 里的尾去抖替换为节流调用（保留原有 30 秒周期兜底）：

```ts
// 旧：clearTimeout + setTimeout(500) 的尾去抖（持续输出时永不触发）
// 新：节流采集，输出期间最多每 TERMINAL_CAPTURE_THROTTLE_MS 采一次
collectThrottled(event.sessionId);
```

`beforeunload` 改为 `flush()`（并定稿段）：

```ts
useEffect(() => {
  const handleBeforeUnload = () => {
    collectorsRef.current.forEach((collector, sessionId) => {
      void collector.flush().then((ok) => {
        if (ok) {
          finalizeSegment(sessionId);
        }
      });
    });
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [finalizeSegment]);
```

新增 `finalizeSegment` 与 `deleteHistoryForTab`（后者取代原 `clearHistoryForTab`）：

```ts
/** 段定稿：live 置 false、endedAt 冻结在最后一次采集时刻 */
const finalizeSegment = useCallback(
  (sessionId: string) => {
    ensureHistoryIndexLoaded();
    for (const [tabId, segments] of historyIndexRef.current) {
      const at = segments.findIndex((s) => s.sessionId === sessionId);
      if (at >= 0) {
        segments[at] = { ...segments[at], live: false, chunks: collectorFor(sessionId).getWrittenChunks() };
        historyIndexRef.current.set(tabId, segments);
      }
    }
    persistHistoryIndex();
  },
  [collectorFor, ensureHistoryIndexLoaded, persistHistoryIndex],
);

/** 删除某标签的全部历史：段记录 + 每段 seq = 0..chunks.length-1 的全部块 */
const deleteHistoryForTab = useCallback(
  async (tabId: string) => {
    ensureHistoryIndexLoaded();
    const segments = historyIndexRef.current.get(tabId) ?? [];
    for (const segment of segments) {
      for (let seq = 0; seq < segment.chunks.length; seq += 1) {
        await terminalOutputStore.delete(chunkKey(segment.sessionId, seq));
      }
      collectorsRef.current.delete(segment.sessionId);
      throttledRef.current.delete(segment.sessionId);
    }
    historyIndexRef.current.delete(tabId);
    persistHistoryIndex();
  },
  [ensureHistoryIndexLoaded, persistHistoryIndex],
);
```

启动定稿（取代原 `archiveSessionAsHistory` 的启动路径）：

```ts
/** 应用启动：残留的 live 段其 PTY 必然已随进程退出而死 → 定稿 */
const finalizeStaleSegments = useCallback(() => {
  ensureHistoryIndexLoaded();
  let changed = false;
  for (const [tabId, segments] of historyIndexRef.current) {
    const next = segments.map((s) => (s.live ? { ...s, live: false } : s));
    if (next.some((s, i) => s !== segments[i])) {
      historyIndexRef.current.set(tabId, next);
      changed = true;
    }
  }
  if (changed) {
    persistHistoryIndex();
  }
}, [ensureHistoryIndexLoaded, persistHistoryIndex]);
```

预算结算：

```ts
const settleHistoryBudget = useCallback(() => {
  const all: { tabId: string; seg: TerminalHistorySegment }[] = [];
  historyIndexRef.current.forEach((segments, tabId) => {
    segments.forEach((seg) => all.push({ tabId, seg }));
  });
  const budget = effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES, null);
  const doomed = selectSegmentsToEvict(all, budget);
  for (const { tabId, sessionId } of doomed) {
    void deleteHistoryForTab(tabId).then(() => {
      const segments = historyIndexRef.current.get(tabId) ?? [];
      historyIndexRef.current.set(
        tabId,
        segments.filter((s) => s.sessionId !== sessionId),
      );
      persistHistoryIndex();
    });
  }
}, [deleteHistoryForTab, persistHistoryIndex]);
```

> Task 15 之后把 `effectiveBudgetBytes(TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES, null)` 换成读偏好 + 读磁盘（`systemMonitor.snapshot()` 的 `disks[]`，优先系统盘）。

`historySegments` 改为排除进行中的段：

```ts
return (historyIndexRef.current.get(tabId) ?? []).filter((s) => !s.live);
```

`terminalXtermPool.ts` 两处改动：

```ts
// 1) 删除 import { SerializeAddon }、PooledXterm.serializeAddon 字段与 loadAddon 调用
// 2) 采集侧 scrollback 提到 5000：否则采集间隙的输出会从环里丢掉，持久化层看不到
const terminal = new Terminal({
  // ...既有选项（fontSize / fontFamily / theme / allowProposedApi 等）
  scrollback: TERMINAL_CAPTURE_SCROLLBACK_LINES,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalCaptureThrottle.test.ts`
Expected: PASS

- [ ] **Step 5: Run terminal suite + typecheck**

Run: `pnpm vitest run src/app/features/terminal && pnpm typecheck`
Expected: 全部 PASS；typecheck 无错误

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/
git commit -m "feat(terminal): capture history via throttled append-only chunks"
```

---

## Phase 2 · 渲染层

### Task 8: 主题色解析

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/historyModel.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/historyModel.style.test.ts`

**Interfaces:**
- Consumes: `HistoryRun`（Task 1）
- Produces:
  - `interface HistoryPalette { foreground: string; background: string; ansi: string[] }`
  - `interface ResolvedRunStyle { color?: string; backgroundColor?: string; fontWeight?: number; fontStyle?: string; textDecoration?: string; opacity?: number }`
  - `resolveRunStyle(run: HistoryRun, palette: HistoryPalette): ResolvedRunStyle`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/historyModel.style.test.ts
import { describe, expect, it } from 'vitest';
import { resolveRunStyle, type HistoryPalette } from '../historyModel';

const palette: HistoryPalette = {
  foreground: '#ffffff',
  background: '#000000',
  ansi: [
    '#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
    '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
  ],
};

describe('resolveRunStyle', () => {
  it('缺省前景用主题前景，不设背景', () => {
    expect(resolveRunStyle({ text: 'a' }, palette)).toEqual({ color: '#ffffff' });
  });

  it('调色板下标 0–15 取 ansi 表', () => {
    expect(resolveRunStyle({ text: 'a', fg: 2 }, palette).color).toBe('#00cd00');
  });

  it('调色板下标 16–255 按 256 色立方换算', () => {
    expect(resolveRunStyle({ text: 'a', fg: 196 }, palette).color).toBe('rgb(255, 0, 0)');
  });

  it('调色板下标 232–255 为灰阶', () => {
    expect(resolveRunStyle({ text: 'a', fg: 232 }, palette).color).toBe('rgb(8, 8, 8)');
  });

  it('直接色原样使用（主题切换时历史仍会正确重着色）', () => {
    expect(resolveRunStyle({ text: 'a', fg: '#123456' }, palette).color).toBe('#123456');
  });

  it('bold / italic / underline / dim 映射为 CSS', () => {
    expect(resolveRunStyle({ text: 'a', bold: true }, palette).fontWeight).toBe(700);
    expect(resolveRunStyle({ text: 'a', italic: true }, palette).fontStyle).toBe('italic');
    expect(resolveRunStyle({ text: 'a', underline: true }, palette).textDecoration).toBe('underline');
    expect(resolveRunStyle({ text: 'a', dim: true }, palette).opacity).toBe(0.6);
  });

  it('inverse 交换前景与背景', () => {
    const style = resolveRunStyle({ text: 'a', fg: 2, bg: 1, inverse: true }, palette);
    expect(style.color).toBe('#cd0000');
    expect(style.backgroundColor).toBe('#00cd00');
  });

  it('非 inverse 且带背景时同时输出前景与背景', () => {
    const style = resolveRunStyle({ text: 'a', bg: 1 }, palette);
    expect(style.color).toBe('#ffffff');
    expect(style.backgroundColor).toBe('#cd0000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyModel.style.test.ts`
Expected: FAIL — `resolveRunStyle is not a function`

- [ ] **Step 3: Write minimal implementation**

追加到 `historyModel.ts`：

```ts
export interface HistoryPalette {
  foreground: string;
  background: string;
  /** 16 个基础色：0–7 常规、8–15 亮色 */
  ansi: string[];
}

export interface ResolvedRunStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: number;
  fontStyle?: string;
  textDecoration?: string;
  opacity?: number;
}

/** 256 色表：16–231 为 6×6×6 立方，232–255 为灰阶 */
function palette256(index: number, palette: HistoryPalette): string {
  if (index < 16) {
    return palette.ansi[index] ?? palette.foreground;
  }
  if (index < 232) {
    const n = index - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    const r = steps[Math.floor(n / 36) % 6];
    const g = steps[Math.floor(n / 6) % 6];
    const b = steps[n % 6];
    return `rgb(${r}, ${g}, ${b})`;
  }
  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
}

function toColor(value: number | string | undefined, palette: HistoryPalette, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === 'number' ? palette256(value, palette) : value;
}

/**
 * 把语义样式解析成当前主题下的具体颜色。
 * 历史里存的是**语义值**（调色板下标 / 直接色），所以切换主题时历史会跟着正确重着色
 * —— 与实时终端共用同一套主题 token 的口径一致。
 */
export function resolveRunStyle(run: HistoryRun, palette: HistoryPalette): ResolvedRunStyle {
  const fg = toColor(run.fg, palette, palette.foreground);
  const bg = run.bg === undefined ? undefined : toColor(run.bg, palette, palette.background);

  const style: ResolvedRunStyle = run.inverse
    ? { color: bg ?? palette.background, backgroundColor: fg }
    : { color: fg };
  if (!run.inverse && bg !== undefined) {
    style.backgroundColor = bg;
  }
  if (run.bold) {
    style.fontWeight = 700;
  }
  if (run.italic) {
    style.fontStyle = 'italic';
  }
  if (run.underline) {
    style.textDecoration = 'underline';
  }
  if (run.dim) {
    style.opacity = 0.6;
  }
  return style;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyModel.style.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/historyModel.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/historyModel.style.test.ts
git commit -m "feat(terminal): resolve semantic history colors against the active theme"
```

---

### Task 9: 历史行与日期分隔符组件

**Files:**
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalHistoryRow.tsx`
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalHistoryDivider.tsx`
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css`
- Test: `ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalHistoryDivider.test.tsx`

**Interfaces:**
- Consumes: `HistoryRun`、`HistoryPalette`、`resolveRunStyle`（Task 8）
- Produces:
  - `TerminalHistoryRow({ runs, palette }: { runs: HistoryRun[]; palette: HistoryPalette })`
  - `TerminalHistoryDivider({ at, label }: { at: number; label: (at: number) => string })`
  - `formatDividerTime(at: number): string` —— 固定 `HH:MM:SS YYYY-MM-DD`，**不随 locale 变化**（沿用用户明确指定的格式）

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/components/terminal/__tests__/TerminalHistoryDivider.test.tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TerminalHistoryDivider, formatDividerTime } from '../TerminalHistoryDivider';

describe('formatDividerTime', () => {
  it('固定为 HH:MM:SS YYYY-MM-DD，不随 locale 变化', () => {
    const at = new Date(2026, 8, 14, 22, 10, 5).getTime();
    expect(formatDividerTime(at)).toBe('22:10:05 2026-09-14');
  });

  it('补零到两位', () => {
    const at = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(formatDividerTime(at)).toBe('03:04:05 2026-01-02');
  });
});

describe('TerminalHistoryDivider', () => {
  it('渲染为两条撑满的线夹一个居中文本', () => {
    const at = new Date(2026, 8, 14, 22, 10, 5).getTime();
    const { container } = render(
      <TerminalHistoryDivider at={at} label={formatDividerTime} />,
    );
    expect(container.querySelectorAll('.adl-terminal-history-divider__line').length).toBe(2);
    expect(container.textContent).toContain('22:10:05 2026-09-14');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/components/terminal/__tests__/TerminalHistoryDivider.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/app/components/terminal/TerminalHistoryRow.tsx
import { memo } from 'react';
import { resolveRunStyle, type HistoryPalette, type HistoryRun } from '@features/terminal/historyModel';

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
```

```tsx
// src/app/components/terminal/TerminalHistoryDivider.tsx
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
```

CSS 追加到 `styles/regions/rightpanel/terminal-panel.css`：

```css
.adl-terminal-history-row {
  /* 行高与字符宽由实时终端 DOM 实测后写入这两个变量，保证两侧视觉延续 */
  height: var(--adl-terminal-cell-height, 17px);
  line-height: var(--adl-terminal-cell-height, 17px);
  white-space: pre;
  font-family: var(--font-mono-custom, monospace);
  font-size: 13px;
}

.adl-terminal-history-divider {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  height: var(--adl-terminal-cell-height, 17px);
  color: var(--text-secondary);
  font-size: var(--text-xs, 12px);
}

.adl-terminal-history-divider__line {
  flex: 1 1 auto;
  height: 1px;
  background: var(--border-subtle);
}

.adl-terminal-history-divider__label {
  flex: 0 0 auto;
  white-space: nowrap;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/components/terminal/__tests__/TerminalHistoryDivider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/terminal/TerminalHistoryRow.tsx ai-digital-life/frontend/src/app/components/terminal/TerminalHistoryDivider.tsx ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalHistoryDivider.test.tsx
git commit -m "feat(terminal): add history row and DOM divider components"
```

---

### Task 10: 布局摊平与虚拟列表替换 TerminalHistoryView

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/historyLayout.ts`
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalHistoryList.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx:357-363`
- Delete: `ai-digital-life/frontend/src/app/components/terminal/TerminalHistoryView.tsx`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/historyLayout.test.ts`

**Interfaces:**
- Consumes: `TerminalHistorySegment`、`chunkKey`（Task 3）、`HistoryChunk` / `wrapLines` / `HistoryPalette`（Task 1、8）、`TerminalHistoryRow` / `TerminalHistoryDivider` / `formatDividerTime`（Task 9）
- Produces:
  - `interface LayoutRow { kind: 'line' | 'divider'; chunkIndex: number; lineIndexInChunk: number; at: number }`
  - `buildLayout(segments: TerminalHistorySegment[], wrappedLinesOf: (sessionId: string, seq: number, cols: number) => number, cols: number): LayoutRow[]`
  - `TerminalHistoryList({ segments, palette, readCellMetrics })`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/historyLayout.test.ts
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../historyLayout';
import type { TerminalHistorySegment } from '../terminalHistoryStore';

const segments: TerminalHistorySegment[] = [
  { sessionId: 's1', endedAt: 100, live: false, chunks: [{ lines: 2, size: 1 }, { lines: 1, size: 1 }] },
  { sessionId: 's2', endedAt: 200, live: false, chunks: [{ lines: 1, size: 1 }] },
];

describe('buildLayout', () => {
  it('按块顺序铺开行，每段末尾追加一条分隔符', () => {
    const rows = buildLayout(segments, () => 1, 80);
    expect(rows.map((r) => r.kind)).toEqual(['line', 'line', 'line', 'divider', 'line', 'divider']);
    expect(rows[0]).toMatchObject({ kind: 'line', chunkIndex: 0, lineIndexInChunk: 0 });
    expect(rows[2]).toMatchObject({ kind: 'line', chunkIndex: 1, lineIndexInChunk: 0 });
    expect(rows[3]).toMatchObject({ kind: 'divider', at: 100 });
    expect(rows[5]).toMatchObject({ kind: 'divider', at: 200 });
  });

  it('折行后行数变化会反映到布局长度', () => {
    expect(buildLayout(segments, () => 3, 40).length).toBeGreaterThan(
      buildLayout(segments, () => 1, 80).length,
    );
  });

  it('空段列表得到空布局', () => {
    expect(buildLayout([], () => 1, 80)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyLayout.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/features/terminal/historyLayout.ts
import type { TerminalHistorySegment } from './terminalHistoryStore';

export interface LayoutRow {
  kind: 'line' | 'divider';
  /** 行类：所属块在段内的下标（即 seq） */
  chunkIndex: number;
  /** 行类：折行后在块内的显示行下标 */
  lineIndexInChunk: number;
  /** 分隔符：该段结束时刻 */
  at: number;
}

/**
 * 把「段 → 块 → 显示行」摊平成一条虚拟列表的行序列。
 *
 * 行高固定，所以布局只需要行数与顺序 —— 由块的 `lines` 与按当前 cols 折行后的
 * 行数算出，不必加载块内容。分隔符作为独立行项跟在所属段之后。
 */
export function buildLayout(
  segments: TerminalHistorySegment[],
  wrappedLinesOf: (sessionId: string, seq: number, cols: number) => number,
  cols: number,
): LayoutRow[] {
  const rows: LayoutRow[] = [];
  for (const segment of segments) {
    segment.chunks.forEach((_meta, seq) => {
      const count = wrappedLinesOf(segment.sessionId, seq, cols);
      for (let i = 0; i < count; i += 1) {
        rows.push({ kind: 'line', chunkIndex: seq, lineIndexInChunk: i, at: segment.endedAt });
      }
    });
    rows.push({ kind: 'divider', chunkIndex: -1, lineIndexInChunk: -1, at: segment.endedAt });
  }
  return rows;
}
```

```tsx
// src/app/components/terminal/TerminalHistoryList.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { TerminalHistoryRow } from './TerminalHistoryRow';
import { TerminalHistoryDivider, formatDividerTime } from './TerminalHistoryDivider';
import { buildLayout } from '@features/terminal/historyLayout';
import { chunkKey, type TerminalHistorySegment } from '@features/terminal/terminalHistoryStore';
import { terminalOutputStore } from '@features/terminal/terminalOutputStore';
import {
  wrapLines,
  type HistoryChunk,
  type HistoryPalette,
  type HistoryRun,
} from '@features/terminal/historyModel';

const OVERSCAN_ROWS = 40;
const FALLBACK_ROW_HEIGHT = 17;

/**
 * 只读历史的虚拟滚动容器。
 *
 * 与旧 TerminalHistoryView 的根本差别：不再用一个 xterm 回放全部历史
 * （xterm 按 rows 预分配行缓冲与画布，单段千行就已是百 MB 量级），
 * 而是把行摊平成 DOM 文本、只挂载视口附近的行。
 */
export function TerminalHistoryList({
  segments,
  palette,
  readCellMetrics,
  unavailableLabel,
}: {
  segments: TerminalHistorySegment[];
  palette: HistoryPalette;
  /** 从实时终端 DOM 实测 cell 宽高，保证两侧视觉延续 */
  readCellMetrics: () => { cellWidth: number; cellHeight: number };
  unavailableLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [cols, setCols] = useState(80);
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW_HEIGHT);
  const [chunks, setChunks] = useState<Map<string, HistoryRun[][]>>(new Map());

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const remeasure = () => {
      const metrics = readCellMetrics();
      const height = metrics.cellHeight || FALLBACK_ROW_HEIGHT;
      setRowHeight(height);
      setCols(Math.max(1, Math.floor(el.clientWidth / (metrics.cellWidth || 8))));
      setViewportHeight(el.clientHeight);
    };
    remeasure();
    const observer = new ResizeObserver(remeasure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [readCellMetrics]);

  const layout = useMemo(
    () =>
      buildLayout(
        segments,
        (sessionId, seq) => {
          const loaded = chunks.get(chunkKey(sessionId, seq));
          if (loaded) {
            return loaded.length;
          }
          const segment = segments.find((s) => s.sessionId === sessionId);
          return segment?.chunks[seq]?.lines ?? 0;
        },
        cols,
      ),
    [segments, chunks, cols],
  );

  const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const lastVisible = Math.min(
    layout.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS,
  );

  /** 行号 → 所属段（段内块连续排布，按前缀和定位） */
  const ownerOf = useMemo(() => {
    const owners: (TerminalHistorySegment | undefined)[] = [];
    for (const segment of segments) {
      const blockRows = segment.chunks.reduce(
        (sum, _c, seq) => sum + (chunks.get(chunkKey(segment.sessionId, seq))?.length ?? segment.chunks[seq].lines),
        0,
      );
      for (let i = 0; i < blockRows + 1; i += 1) {
        owners.push(segment);
      }
    }
    return owners;
  }, [segments, chunks]);

  // 块级懒加载：视口内的块才 load → parse → 按 cols 折行
  useEffect(() => {
    let cancelled = false;
    const needed = new Set<string>();
    for (let i = firstVisible; i < lastVisible; i += 1) {
      const row = layout[i];
      const owner = ownerOf[i];
      if (row && owner && row.kind === 'line') {
        needed.add(chunkKey(owner.sessionId, row.chunkIndex));
      }
    }
    void (async () => {
      for (const key of needed) {
        if (cancelled || chunks.has(key)) {
          continue;
        }
        const raw = await terminalOutputStore.load(key);
        if (cancelled || raw === null) {
          continue;
        }
        let lines: HistoryRun[][];
        try {
          lines = wrapLines((JSON.parse(raw) as HistoryChunk).lines, cols);
        } catch {
          lines = [[{ text: unavailableLabel }]];
        }
        setChunks((prev) => new Map(prev).set(key, lines));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstVisible, lastVisible, layout, ownerOf, cols, chunks, unavailableLabel]);

  // 初始定位到最底部（与旧 scrollToBottom 行为一致）
  useEffect(() => {
    const el = scrollRef.current;
    if (el && layout.length > 0) {
      el.scrollTop = el.scrollHeight;
    }
  }, [layout.length]);

  return (
    <div
      ref={scrollRef}
      className="adl-terminal-history-list"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div
        className="adl-terminal-history-list__spacer"
        style={{ height: layout.length * rowHeight }}
      >
        {layout.slice(firstVisible, lastVisible).map((row, index) => {
          const absolute = firstVisible + index;
          const owner = ownerOf[absolute];
          return (
            <div
              key={absolute}
              className="adl-terminal-history-list__row"
              style={{ top: absolute * rowHeight }}
            >
              {row.kind === 'divider' ? (
                <TerminalHistoryDivider at={row.at} label={formatDividerTime} />
              ) : (
                <TerminalHistoryRow
                  runs={owner ? (chunks.get(chunkKey(owner.sessionId, row.chunkIndex))?.[row.lineIndexInChunk] ?? []) : []}
                  palette={palette}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

CSS 追加：

```css
.adl-terminal-history-list {
  position: absolute;
  top: var(--space-2, 8px);
  left: var(--space-2, 8px);
  right: 0;
  bottom: var(--space-2, 8px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.adl-terminal-history-list::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.adl-terminal-history-list__spacer {
  position: relative;
  width: 100%;
}

.adl-terminal-history-list__row {
  position: absolute;
  left: 0;
  right: 0;
}
```

`TerminalPanel.tsx` 替换渲染（同时删掉旧组件文件）：

```tsx
{hasHistory ? (
  <div className="adl-terminal-history">
    <TerminalHistoryList
      segments={historySegments}
      palette={readTerminalPalette()}
      readCellMetrics={readTerminalCellMetrics}
      unavailableLabel={t.terminalHistorySegmentUnavailable}
    />
  </div>
) : null}
```

在 `terminalXtermPool.ts` 中导出两个度量读取器（供两侧共用，保证口径一致）：

```ts
/** 从实时终端实例读取主题 → 历史与实时共用同一套配色 */
export function readTerminalPalette(): HistoryPalette {
  const theme = readTerminalTheme();
  return {
    foreground: theme.foreground ?? '#ffffff',
    background: theme.background ?? '#000000',
    ansi: [
      theme.black ?? '#000000',
      theme.red ?? '#cd0000',
      theme.green ?? '#00cd00',
      theme.yellow ?? '#cdcd00',
      theme.blue ?? '#0000ee',
      theme.magenta ?? '#cd00cd',
      theme.cyan ?? '#00cdcd',
      theme.white ?? '#e5e5e5',
      theme.brightBlack ?? '#7f7f7f',
      theme.brightRed ?? '#ff0000',
      theme.brightGreen ?? '#00ff00',
      theme.brightYellow ?? '#ffff00',
      theme.brightBlue ?? '#5c5cff',
      theme.brightMagenta ?? '#ff00ff',
      theme.brightCyan ?? '#00ffff',
      theme.brightWhite ?? '#ffffff',
    ],
  };
}

/** 从实时终端 DOM 实测 cell 宽高：历史行高必须与实时终端完全一致，否则两侧对不齐 */
export function readTerminalCellMetrics(): { cellWidth: number; cellHeight: number } {
  const entry = terminalXtermPool.first();
  const screen = entry?.hostEl.querySelector('.xterm-screen') as HTMLElement | null;
  if (!screen || !entry) {
    return { cellWidth: 8, cellHeight: FALLBACK_ROW_HEIGHT };
  }
  return {
    cellWidth: screen.offsetWidth / Math.max(1, entry.terminal.cols),
    cellHeight: screen.offsetHeight / Math.max(1, entry.terminal.rows),
  };
}
```

```bash
git rm ai-digital-life/frontend/src/app/components/terminal/TerminalHistoryView.tsx
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/historyLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Run whole suite + typecheck**

Run: `pnpm vitest run src/app && pnpm typecheck`
Expected: PASS，无类型错误

- [ ] **Step 6: Commit**

```bash
git add -A ai-digital-life/frontend/src
git commit -m "refactor(terminal): render read-only history as a virtualized DOM list"
```

---

### Task 11: 移除 SerializeAddon 与 terminalHistoryCompose

**Files:**
- Delete: `ai-digital-life/frontend/src/app/features/terminal/terminalHistoryCompose.ts`
- Delete: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryCompose.test.ts`
- Modify: `ai-digital-life/frontend/package.json`

**Interfaces:**
- Consumes: 无
- Produces: 无（清理任务）

- [ ] **Step 1: 确认无残留引用**

Run: `rg -n "terminalHistoryCompose|SerializeAddon|serializeAddon|addon-serialize" ai-digital-life/frontend/src ai-digital-life/frontend/package.json`
Expected: 无输出（若仍有输出，先修掉引用再继续）

- [ ] **Step 2: 删除文件与依赖**

```bash
git rm ai-digital-life/frontend/src/app/features/terminal/terminalHistoryCompose.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalHistoryCompose.test.ts
cd ai-digital-life/frontend && pnpm remove @xterm/addon-serialize
```

- [ ] **Step 3: 全量验证**

Run: `cd ai-digital-life/frontend && pnpm typecheck && pnpm test`
Expected: typecheck 无错误；全部测试 PASS

- [ ] **Step 4: Commit**

```bash
git add -A ai-digital-life/frontend
git commit -m "chore(terminal): drop serialize addon and single-xterm replay helpers"
```

---

## Phase 3 · 交互层

### Task 12: 折叠三态与持久化

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/terminalRegionCollapse.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalRegionCollapse.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `const TERMINAL_REGION_COLLAPSE_KEY = 'adl-terminal:region-collapse'`
  - `type RegionCollapse = 'none' | 'history' | 'live'`、`type RegionName = 'history' | 'live'`
  - `toggleRegion(collapse: RegionCollapse, region: RegionName): RegionCollapse`
  - `isRegionVisible(collapse: RegionCollapse, region: RegionName, available: boolean): boolean`
  - `isCollapseButtonVisible(hasHistory: boolean): boolean`
  - `normalizeRegionCollapseMap(raw: unknown): Record<string, RegionCollapse>`
  - `terminalRegionCollapseStore.load()` / `.save(map)`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/terminalRegionCollapse.test.ts
import { describe, expect, it } from 'vitest';
import {
  isCollapseButtonVisible,
  isRegionVisible,
  normalizeRegionCollapseMap,
  toggleRegion,
} from '../terminalRegionCollapse';

describe('toggleRegion', () => {
  it('两个区域都展开时收起指定区域', () => {
    expect(toggleRegion('none', 'history')).toBe('history');
    expect(toggleRegion('none', 'live')).toBe('live');
  });

  it('已收起某区域时再次点击即展开', () => {
    expect(toggleRegion('history', 'history')).toBe('none');
    expect(toggleRegion('live', 'live')).toBe('none');
  });

  it('三态值域天然保证不可能两个都收起', () => {
    for (const state of ['none', 'history', 'live'] as const) {
      for (const region of ['history', 'live'] as const) {
        expect(['none', 'history', 'live']).toContain(toggleRegion(state, region));
      }
    }
  });
});

describe('isRegionVisible', () => {
  it('被收起的区域不可见，另一个区域永远可见', () => {
    expect(isRegionVisible('history', 'history', true)).toBe(false);
    expect(isRegionVisible('history', 'live', true)).toBe(true);
    expect(isRegionVisible('live', 'live', true)).toBe(false);
    expect(isRegionVisible('live', 'history', true)).toBe(true);
  });

  it('历史不可用时历史区始终不可见', () => {
    expect(isRegionVisible('none', 'history', false)).toBe(false);
  });
});

describe('isCollapseButtonVisible', () => {
  it('只有两个区域都可能显示时才出现收起/展开按钮', () => {
    expect(isCollapseButtonVisible(true)).toBe(true);
    expect(isCollapseButtonVisible(false)).toBe(false);
  });
});

describe('normalizeRegionCollapseMap', () => {
  it('丢弃非法值与非法标签键', () => {
    expect(normalizeRegionCollapseMap({ t1: 'history', t2: 'nope', t3: 1 })).toEqual({
      t1: 'history',
    });
    expect(normalizeRegionCollapseMap(null)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalRegionCollapse.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/features/terminal/terminalRegionCollapse.ts
import { makePersistedWriter, readJson } from '@stores/storageHelpers';

export const TERMINAL_REGION_COLLAPSE_KEY = 'adl-terminal:region-collapse';

export type RegionCollapse = 'none' | 'history' | 'live';
export type RegionName = 'history' | 'live';

/**
 * 折叠状态按**标签**记录。
 *
 * 用三态而不是两个布尔：值域本身就排除了「两个区域都收起」这种非法组合，
 * 因此不需要额外的互斥校验，也不可能出现「两个区域都不可见」的空面板。
 */
export function toggleRegion(collapse: RegionCollapse, region: RegionName): RegionCollapse {
  return collapse === region ? 'none' : region;
}

export function isRegionVisible(
  collapse: RegionCollapse,
  region: RegionName,
  available: boolean,
): boolean {
  if (region === 'history' && !available) {
    return false;
  }
  return collapse !== region;
}

/**
 * 「收起/展开」按钮只在**两个区域都可能显示**时出现。
 * 历史被删除后只剩实时区，按钮自然消失 —— 这正是需求里「不再显示收起/展开」的来源。
 */
export function isCollapseButtonVisible(hasHistory: boolean): boolean {
  return hasHistory;
}

const scheduleWrite = makePersistedWriter(TERMINAL_REGION_COLLAPSE_KEY);

export function normalizeRegionCollapseMap(raw: unknown): Record<string, RegionCollapse> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, RegionCollapse> = {};
  for (const [tabId, value] of Object.entries(source)) {
    if (value === 'none' || value === 'history' || value === 'live') {
      out[tabId] = value;
    }
  }
  return out;
}

export const terminalRegionCollapseStore = {
  load(): Record<string, RegionCollapse> {
    return normalizeRegionCollapseMap(readJson<unknown>(TERMINAL_REGION_COLLAPSE_KEY, {}));
  },
  save(map: Record<string, RegionCollapse>): void {
    scheduleWrite(map);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalRegionCollapse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalRegionCollapse.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalRegionCollapse.test.ts
git commit -m "feat(terminal): add per-tab region collapse state"
```

---

### Task 13: 图标、文案与区域按钮叠加层

**Files:**
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalRegionActions.tsx`
- Modify: `ai-digital-life/frontend/src/app/icons/terminal-nav.tsx`、`ai-digital-life/frontend/src/app/icons/index.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/terminal.ts`、`ai-digital-life/frontend/src/app/i18n/en-US/terminal.ts`
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css`
- Test: `ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx`

**Interfaces:**
- Consumes: `RegionName`（Task 12）
- Produces:
  - `TerminalRegionActions({ region, collapsed, canCollapse, onToggleCollapse, onDelete, onClear, titles, alwaysVisible })`
  - `interface TerminalRegionActionsTitles { collapse: string; expand: string; regionName: string; deleteLabel?: string; deleteTitle?: string; clearLabel?: string; clearTitle?: string }`
  - 新图标：`IconRegionCollapse`、`IconRegionExpand`、`IconClearDisplay`（导出自 `@icons`）

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalRegionActions, type TerminalRegionActionsTitles } from '../TerminalRegionActions';

const titles: TerminalRegionActionsTitles = {
  collapse: '收起{region}',
  expand: '展开{region}',
  regionName: '只读历史区域',
  deleteLabel: '删除历史',
  deleteTitle: '删除该标签的全部历史记录（不可恢复）',
  clearLabel: '清空',
  clearTitle: '清空实时终端当前显示的内容（等同 clear 命令）',
};

describe('TerminalRegionActions', () => {
  it('删除在左、收起在右', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsed={false}
        canCollapse
        onToggleCollapse={() => {}}
        onDelete={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '删除历史',
      '收起只读历史区域',
    ]);
  });

  it('清空在左、收起在右（实时区）', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsed={false}
        canCollapse
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={{ ...titles, regionName: '实时终端区域' }}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '清空',
      '收起实时终端区域',
    ]);
  });

  it('只剩一个区域（canCollapse=false）时不渲染收起/展开按钮', () => {
    render(
      <TerminalRegionActions
        region="live"
        collapsed={false}
        canCollapse={false}
        onToggleCollapse={() => {}}
        onClear={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText('收起只读历史区域')).toBeNull();
  });

  it('收起态时按钮为「展开」，且 title 为系统原生 title 属性', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsed
        canCollapse
        onToggleCollapse={() => {}}
        titles={titles}
      />,
    );
    const btn = screen.getByLabelText('展开只读历史区域');
    expect(btn.getAttribute('title')).toBe('展开只读历史区域');
  });

  it('删除按钮的原生 title 写清后果（不加二次确认）', () => {
    render(
      <TerminalRegionActions
        region="history"
        collapsed={false}
        canCollapse
        onToggleCollapse={() => {}}
        onDelete={() => {}}
        titles={titles}
      />,
    );
    expect(screen.getByLabelText('删除历史').getAttribute('title')).toBe(
      '删除该标签的全部历史记录（不可恢复）',
    );
  });

  it('点击回调正确触发', async () => {
    const onDelete = vi.fn();
    const onToggle = vi.fn();
    render(
      <TerminalRegionActions
        region="history"
        collapsed={false}
        canCollapse
        onToggleCollapse={onToggle}
        onDelete={onDelete}
        titles={titles}
      />,
    );
    await userEvent.click(screen.getByLabelText('删除历史'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByLabelText('收起只读历史区域'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('常驻态加 is-always-visible 类（不依赖 hover）', () => {
    const { container } = render(
      <TerminalRegionActions
        region="live"
        collapsed
        canCollapse={false}
        onToggleCollapse={() => {}}
        titles={titles}
        alwaysVisible
      />,
    );
    expect(container.querySelector('.is-always-visible')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: Write minimal implementation**

图标（追加到 `icons/terminal-nav.tsx`；**不内联使用**）：

```tsx
import { makeFilled, makeThin } from './helper';

/**
 * 收起：四条角括号路径。
 * 原 SVG 未声明 stroke-width（浏览器默认 1），在 14px 尺寸下过细，故取 1.5。
 */
export const IconRegionCollapse = makeThin(
  <>
    <path d="M9 4V7C9 8.10457 8.10457 9 7 9H4" />
    <path d="M15 20L15 17C15 15.8954 15.8954 15 17 15L20 15" />
    <path d="M20 9L17 9C15.8954 9 15 8.10457 15 7L15 4" />
    <path d="M4 15L7 15C8.10457 15 9 15.8954 9 17L9 20" />
  </>,
  1.5,
);

export const IconRegionExpand = makeFilled(
  '0 0 15 15',
  <path
    fillRule="evenodd"
    clipRule="evenodd"
    d="M7.5 0.75L9.75 3H5.25L7.5 0.75ZM7.5 14.25L9.75 12H5.25L7.5 14.25ZM3 5.25L0.75 7.5L3 9.75V5.25ZM14.25 7.5L12 5.25V9.75L14.25 7.5Z"
  />,
);

export const IconClearDisplay = makeFilled(
  '0 0 24 24',
  <path
    fillRule="evenodd"
    clipRule="evenodd"
    d="M13.0828 19.0632C12.6389 19.5072 12.2399 19.9062 11.8725 20.25H21C21.4142 20.25 21.75 20.5858 21.75 21C21.75 21.4142 21.4142 21.75 21 21.75H9C8.98166 21.75 8.96347 21.7493 8.94546 21.748C8.24156 21.7211 7.64439 21.4169 7.05863 20.97C6.47124 20.5218 5.81539 19.866 5.01269 19.0632L4.93674 18.9873C4.13402 18.1846 3.47815 17.5288 3.03 16.9414C2.56159 16.3274 2.25 15.701 2.25 14.9522C2.25 14.2035 2.56159 13.577 3.03 12.9631C3.47816 12.3757 4.13402 11.7199 4.93674 10.9172L10.9172 4.93674C11.7199 4.13403 12.3757 3.47815 12.9631 3.03C13.577 2.56159 14.2035 2.25 14.9522 2.25C15.701 2.25 16.3274 2.56159 16.9414 3.03C17.5288 3.47816 18.1846 4.13402 18.9873 4.93674L19.0632 5.01269C19.866 5.81539 20.5218 6.47124 20.97 7.05863C21.4384 7.67256 21.75 8.29902 21.75 9.04776C21.75 9.79649 21.4384 10.423 20.97 11.0369C20.5219 11.6243 19.866 12.2801 19.0633 13.0827L13.0828 19.0632ZM11.9399 6.03539C12.7899 5.18538 13.3752 4.60235 13.873 4.22253C14.3535 3.85592 14.6633 3.75 14.9522 3.75C15.2411 3.75 15.551 3.85592 16.0315 4.22253C16.5293 4.60235 17.1146 5.18538 17.9646 6.03539C18.8146 6.88541 19.3977 7.47069 19.7775 7.9685C20.1441 8.449 20.25 8.75886 20.25 9.04776C20.25 9.33665 20.1441 9.64651 19.7775 10.127C19.3977 10.6248 18.8146 11.2101 17.9646 12.0601L13.7713 16.2534L7.74662 10.2287L11.9399 6.03539ZM9.04776 20.25C9.33665 20.25 9.64651 20.1441 10.127 19.7775C10.6248 19.3977 11.2101 18.8146 12.0601 17.9646L12.7107 17.314L6.68596 11.2893L6.03539 11.9399C5.18538 12.7899 4.60235 13.3752 4.22253 13.873C3.85592 14.3535 3.75 14.6633 3.75 14.9522C3.75 15.2411 3.85592 15.551 4.22253 16.0315C4.60235 16.5293 5.18538 17.1146 6.03539 17.9646C6.88541 18.8146 7.47069 19.3977 7.9685 19.7775C8.449 20.1441 8.75886 20.25 9.04776 20.25Z"
  />,
);
```

`icons/index.ts` 补上三个 re-export（与既有 `IconTerminalDirectory` 同处）。

文案（`zh-CN/terminal.ts` 追加；`en-US/terminal.ts` 必须加同名 key，否则 `keys.test.ts` 失败）：

```ts
// zh-CN/terminal.ts 追加
terminalHistoryRegionName: '只读历史区域',
terminalLiveRegionName: '实时终端区域',
terminalRegionCollapseTitle: '收起{region}（另一个区域会铺满剩余空间）',
terminalRegionExpandTitle: '展开{region}',
terminalHistoryDeleteLabel: '删除历史',
terminalHistoryDeleteTitle: '删除该标签的全部历史记录（不可恢复）',
terminalLiveClearLabel: '清空',
terminalLiveClearTitle: '清空实时终端当前显示的内容（等同 clear 命令）',
terminalHistorySegmentUnavailable: '该段历史内容不可用',
```

```ts
// en-US/terminal.ts 追加
terminalHistoryRegionName: 'Read-only history area',
terminalLiveRegionName: 'Live terminal area',
terminalRegionCollapseTitle: 'Collapse {region} (the other area fills the space)',
terminalRegionExpandTitle: 'Expand {region}',
terminalHistoryDeleteLabel: 'Delete history',
terminalHistoryDeleteTitle: 'Delete all history for this tab (cannot be undone)',
terminalLiveClearLabel: 'Clear',
terminalLiveClearTitle: 'Clear what the live terminal currently shows (same as the clear command)',
terminalHistorySegmentUnavailable: 'This history content is unavailable',
```

组件：

```tsx
// src/app/components/terminal/TerminalRegionActions.tsx
import type { RegionName } from '@features/terminal/terminalRegionCollapse';
import { IconClearDisplay, IconDelete, IconRegionCollapse, IconRegionExpand } from '@icons';

export interface TerminalRegionActionsTitles {
  collapse: string;
  expand: string;
  regionName: string;
  deleteLabel?: string;
  deleteTitle?: string;
  clearLabel?: string;
  clearTitle?: string;
}

interface TerminalRegionActionsProps {
  region: RegionName;
  /** 该区域当前是否处于收起态（收起态下本组件作为常驻「展开」按钮渲染） */
  collapsed: boolean;
  /** 两个区域都可能显示时才为 true；否则不渲染收起/展开按钮 */
  canCollapse: boolean;
  onToggleCollapse: () => void;
  onDelete?: () => void;
  onClear?: () => void;
  titles: TerminalRegionActionsTitles;
  /** 常驻显示（该区域已是唯一可见区域），不依赖 hover */
  alwaysVisible?: boolean;
}

/**
 * 区域右上角按钮叠加层。
 *
 * 两个约束来自需求与既有实现：
 * 1. 顺序固定为「删除/清空在左，收起/展开在右」；
 * 2. 用**系统原生 title**（不是组件的自定义 Tooltip）—— 直接写在 `title` 属性上。
 */
export function TerminalRegionActions({
  region,
  collapsed,
  canCollapse,
  onToggleCollapse,
  onDelete,
  onClear,
  titles,
  alwaysVisible,
}: TerminalRegionActionsProps) {
  const toggleTitle = (collapsed ? titles.expand : titles.collapse).replace(
    '{region}',
    titles.regionName,
  );

  return (
    <div
      className={`adl-terminal-region-actions${alwaysVisible ? ' is-always-visible' : ''}`}
    >
      {onDelete ? (
        <button
          type="button"
          className="adl-terminal-region-actions__btn"
          aria-label={titles.deleteLabel}
          title={titles.deleteTitle}
          onClick={onDelete}
        >
          <IconDelete size={14} decorative />
        </button>
      ) : null}
      {onClear ? (
        <button
          type="button"
          className="adl-terminal-region-actions__btn"
          aria-label={titles.clearLabel}
          title={titles.clearTitle}
          onClick={onClear}
        >
          <IconClearDisplay size={14} decorative />
        </button>
      ) : null}
      {canCollapse ? (
        <button
          type="button"
          className="adl-terminal-region-actions__btn"
          aria-label={toggleTitle}
          title={toggleTitle}
          onClick={onToggleCollapse}
          data-region={region}
        >
          {collapsed ? (
            <IconRegionExpand size={14} decorative />
          ) : (
            <IconRegionCollapse size={14} decorative />
          )}
        </button>
      ) : null}
    </div>
  );
}
```

CSS 追加：

```css
.adl-terminal-region-actions {
  position: absolute;
  top: var(--space-2, 8px);
  /* 右移 18px 避开 xterm 自绘滚动条的 14px 命中带，否则按钮会挡住滚动条拖拽 */
  right: 18px;
  display: flex;
  gap: var(--space-1, 4px);
  z-index: 4;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-150) var(--ease-default);
}

/* 悬停区域时显露；常驻态由 is-always-visible 驱动，不依赖 hover */
.adl-terminal-history:hover .adl-terminal-region-actions,
.adl-terminal-live:hover .adl-terminal-region-actions,
.adl-terminal-region-actions.is-always-visible {
  opacity: 1;
  pointer-events: auto;
}

.adl-terminal-region-actions__btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--surface-subtle);
}

.adl-terminal-region-actions__btn:hover {
  color: var(--text-primary);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/components/terminal/__tests__/TerminalRegionActions.test.tsx src/app/i18n`
Expected: PASS（含 i18n 顶层 key 一致性检查）

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/terminal/TerminalRegionActions.tsx ai-digital-life/frontend/src/app/icons ai-digital-life/frontend/src/app/i18n ai-digital-life/frontend/src/styles
git commit -m "feat(terminal): add region action overlay with native titles"
```

---

### Task 14: TerminalPanel 接线（可见性 / 常驻展开 / 删除 / 清空）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx:347-395`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPanel.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalPanelRegions.test.ts`

**Interfaces:**
- Consumes: `terminalRegionCollapseStore` / `toggleRegion` / `isRegionVisible` / `isCollapseButtonVisible`（Task 12）、`TerminalRegionActions`（Task 13）、`deleteHistoryForTab`（Task 7）
- Produces: `terminalActions.toggleRegionCollapse(region: RegionName)`、`terminalActions.deleteHistory(tabId: string)`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/features/terminal/__tests__/terminalPanelRegions.test.ts
import { describe, expect, it } from 'vitest';
import {
  isCollapseButtonVisible,
  isRegionVisible,
  toggleRegion,
} from '../terminalRegionCollapse';

describe('两个区域的可见性组合（需求逐条对应）', () => {
  it('收起历史后历史区不可见、实时区铺满，收起按钮仍显示', () => {
    const collapse = toggleRegion('none', 'history');
    expect(collapse).toBe('history');
    expect(isRegionVisible(collapse, 'history', true)).toBe(false);
    expect(isRegionVisible(collapse, 'live', true)).toBe(true);
    expect(isCollapseButtonVisible(true)).toBe(true);
  });

  it('点常驻「展开」后两区都可见', () => {
    expect(toggleRegion('history', 'history')).toBe('none');
  });

  it('删除历史后实时区恢复展开，且不再显示收起/展开按钮', () => {
    // 删除历史时折叠状态复位（见 useTerminalPanel.deleteHistory）
    const reset = toggleRegion('live', 'live');
    expect(reset).toBe('none');
    expect(isRegionVisible(reset, 'live', true)).toBe(true);
    expect(isCollapseButtonVisible(false)).toBe(false);
  });

  it('每个标签的折叠状态互不影响', () => {
    const map: Record<string, ReturnType<typeof toggleRegion>> = {
      tabA: toggleRegion('none', 'history'),
      tabB: toggleRegion('none', 'live'),
    };
    expect(map.tabA).toBe('history');
    expect(map.tabB).toBe('live');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalPanelRegions.test.ts`
Expected: 若 Task 12 导出齐全则直接 PASS；否则 FAIL，先补齐导出

- [ ] **Step 3: Wire the panel**

`useTerminalPanel.ts` 新增折叠与删除：

```ts
const [collapseMap, setCollapseMap] = useState<Record<string, RegionCollapse>>(() =>
  terminalRegionCollapseStore.load(),
);
useEffect(() => {
  terminalRegionCollapseStore.save(collapseMap);
}, [collapseMap]);

const collapseTabId = activeTab?.id ?? '';
const regionCollapse: RegionCollapse = collapseTabId
  ? (collapseMap[collapseTabId] ?? 'none')
  : 'none';

const toggleRegionCollapse = useCallback(
  (region: RegionName) => {
    if (!collapseTabId) {
      return;
    }
    setCollapseMap((prev) => ({
      ...prev,
      [collapseTabId]: toggleRegion(prev[collapseTabId] ?? 'none', region),
    }));
  },
  [collapseTabId],
);

/**
 * 删除历史：清索引 + 清全部块 + 折叠状态复位为 'none'
 * （实时区若原本收起则随之恢复展开；历史没了 → 收起/展开按钮自然消失）。
 */
const deleteHistory = useCallback(
  async (tabId: string) => {
    await deleteHistoryForTab(tabId);
    setCollapseMap((prev) => ({ ...prev, [tabId]: 'none' }));
  },
  [deleteHistoryForTab],
);
```

把 `regionCollapse` / `toggleRegionCollapse` / `deleteHistory` 加入返回的 `terminalState` / `terminalActions`。

`TerminalPanel.tsx` 渲染部分改为：

```tsx
const historyVisible = isRegionVisible(regionCollapse, 'history', hasHistory);
const liveVisible = isRegionVisible(regionCollapse, 'live', true);
const canCollapse = isCollapseButtonVisible(hasHistory);

const regionActionTitles = (region: RegionName) => ({
  collapse: t.terminalRegionCollapseTitle,
  expand: t.terminalRegionExpandTitle,
  regionName: region === 'history' ? t.terminalHistoryRegionName : t.terminalLiveRegionName,
  deleteLabel: t.terminalHistoryDeleteLabel,
  deleteTitle: t.terminalHistoryDeleteTitle,
  clearLabel: t.terminalLiveClearLabel,
  clearTitle: t.terminalLiveClearTitle,
});

<div
  ref={viewContainerRef}
  className={`adl-tool-primary__scroll adl-tool-primary__scroll--terminal${isDual ? ' is-dual' : ' is-single'}${viewPrefs.historyFirst ? '' : ' is-history-last'}${hasActiveTab ? '' : ' is-empty'}`}
  style={{ '--adl-terminal-history-ratio': `${viewPrefs.historyRatio}` } as React.CSSProperties}
>
  {hasActiveTab ? (
    <>
      {historyVisible ? (
        <div className={`adl-terminal-history${liveVisible ? '' : ' is-solo'}`}>
          <TerminalHistoryList
            segments={historySegments}
            palette={readTerminalPalette()}
            readCellMetrics={readTerminalCellMetrics}
            unavailableLabel={t.terminalHistorySegmentUnavailable}
          />
          <TerminalRegionActions
            region="history"
            collapsed={regionCollapse === 'history'}
            canCollapse={canCollapse}
            onToggleCollapse={() => terminalActions.toggleRegionCollapse('history')}
            onDelete={() => void terminalActions.deleteHistory(activeTab.id)}
            titles={regionActionTitles('history')}
            alwaysVisible={!liveVisible}
          />
        </div>
      ) : null}

      {historyVisible && liveVisible ? (
        <div
          className="adl-terminal-divider"
          role="separator"
          aria-orientation={isDual ? 'vertical' : 'horizontal'}
          aria-label={t.terminalDividerLabel}
          aria-valuemin={HISTORY_RATIO_MIN}
          aria-valuemax={HISTORY_RATIO_MAX}
          aria-valuenow={Math.round(viewPrefs.historyRatio * 100) / 100}
          onPointerDown={terminalActions.handleDividerPointerDown}
        />
      ) : null}

      {liveVisible ? (
        <div className="adl-terminal-live">
          <XtermTerminal
            ref={xtermRef}
            sessionId={activeTab?.sessionId ?? null}
            className="adl-terminal-canvas"
            onData={terminalActions.handleXtermData}
            onResize={terminalActions.handleXtermResize}
          />
          <TerminalRegionActions
            region="live"
            collapsed={regionCollapse === 'live'}
            canCollapse={canCollapse}
            onToggleCollapse={() => terminalActions.toggleRegionCollapse('live')}
            onClear={terminalActions.handleClear}
            titles={regionActionTitles('live')}
            alwaysVisible={!historyVisible}
          />
        </div>
      ) : null}

      {activeTab?.status === 'terminated' && !activeTab?.sessionId ? (
        <div className="adl-terminal-error-note">
          <span>{'\u26A0'}</span>
          <span>{t.terminalShellNotFound}</span>
        </div>
      ) : null}
    </>
  ) : null}
</div>
```

CSS 追加（只剩一个区域时铺满）：

```css
/* 只剩一个区域时铺满：历史区默认按比例占主轴，独存时必须改为占满 */
.adl-terminal-history.is-solo {
  flex: 1 1 auto;
  height: auto;
  width: auto;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/features/terminal/__tests__/terminalPanelRegions.test.ts`
Expected: PASS

- [ ] **Step 5: 手动验收清单（Tauri 与浏览器预览各跑一遍）**

1. 悬停只读历史区 → 右上角出现「删除 ｜ 收起」；移开即消失。
2. 点「收起」→ 历史区消失、实时终端铺满；实时区右上角**常驻**「展开」按钮。
3. 点常驻「展开」→ 历史区回来，按钮回到悬停显露。
4. 点「删除」→ 历史区关闭、实时区铺满，且实时区**不再出现**收起/展开按钮；重启后该标签历史为空。
5. 实时区悬停 → 「清空 ｜ 收起」；点「清空」后显示内容清空，**重启后磁盘上的历史不受影响**。
6. 切换标签 → 各标签折叠状态互不影响；重启后折叠状态被记住。
7. 拖分界线只改比例、不影响分隔符整行居中；拉宽/收窄面板 → 分隔符始终铺满且日期居中。
8. 跑一条持续输出的长命令 → 历史里没有缺口；分隔符时间等于**关闭应用的时刻**（不是下次启动时刻）。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal ai-digital-life/frontend/src/styles
git commit -m "feat(terminal): wire region collapse, delete and clear into the panel"
```

---

## Phase 4 · 设置层

### Task 15: 预算偏好字段（Rust → TS）

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/config.rs`
- Modify: `ai-digital-life/crates/types/src/types/config.rs`
- Modify: `ai-digital-life/crates/server/config/config.json`
- Modify: `ai-digital-life/frontend/src/shared/ipc-types.generated.ts`
- Modify: `ai-digital-life/frontend/src/shared/defaultPreferences.ts`
- Modify: `ai-digital-life/frontend/src/app/utils/settingsViewModel.ts`
- Test: `ai-digital-life/frontend/src/shared/defaultPreferences.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - Rust：`AppConfig.terminal_history_budget_bytes: u64`（默认 `1 << 30`）；`AppPreferencePatch` 与 `ConfigSnapshot` 的同名字段
  - TS：`ConfigSnapshot.terminalHistoryBudgetBytes: number`、`AppPreferencePatch.terminalHistoryBudgetBytes?: number`
  - `DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES = 1 << 30`
  - `getDefaultForSetting('terminalHistoryBudgetBytes')` 返回该默认值

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/defaultPreferences.test.ts（追加）
import {
  DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES,
  getDefaultForSetting,
} from './defaultPreferences';

describe('terminal history budget default', () => {
  it('默认预算为 1 GiB', () => {
    expect(DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES).toBe(1 << 30);
  });

  it('可作为设置项取到默认值', () => {
    expect(getDefaultForSetting('terminalHistoryBudgetBytes')).toBe(1 << 30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/defaultPreferences.test.ts`
Expected: FAIL — `DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES` 未导出

- [ ] **Step 3: 实现（Rust 与 TS 同步）**

`crates/kernel/src/config.rs`：

```rust
fn default_terminal_history_budget_bytes() -> u64 {
    1 << 30
}

// AppConfig 内追加字段
    /// 只读历史的磁盘预算（字节）。0 = 跟随磁盘剩余空间。
    #[serde(default = "default_terminal_history_budget_bytes")]
    pub terminal_history_budget_bytes: u64,

// AppConfig::default() 追加
            terminal_history_budget_bytes: default_terminal_history_budget_bytes(),
```

`crates/types/src/types/config.rs`：

```rust
fn default_terminal_history_budget_bytes_snapshot() -> u64 {
    1 << 30
}

// AppPreferencePatch 内追加
    /// 只读历史的磁盘预算（字节）；None = 不改。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_history_budget_bytes: Option<u64>,

// ConfigSnapshot 内追加
    /// 只读历史的磁盘预算（字节）。0 = 跟随磁盘剩余空间。
    #[serde(default = "default_terminal_history_budget_bytes_snapshot")]
    pub terminal_history_budget_bytes: u64,
```

`crates/server/config/config.json` 追加（JSON 不允许尾逗号）：

```json
  "terminal_history_budget_bytes": 1073741824
```

`frontend/src/shared/ipc-types.generated.ts`（手维护，两处）：

```ts
// AppPreferencePatch 内
  terminalHistoryBudgetBytes?: number;

// ConfigSnapshot 内
  terminalHistoryBudgetBytes: number;
```

`frontend/src/shared/defaultPreferences.ts`：

```ts
export const DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES = 1 << 30;

// getDefaultPreferences() 内追加
    terminalHistoryBudgetBytes: DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES,

// getDefaultForSetting() 的 switch 内追加
    case 'terminalHistoryBudgetBytes':
      return DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES;
```

`frontend/src/app/utils/settingsViewModel.ts`：

```ts
// preferencePatchFromSettingChange 内追加
  if (id === 'terminalHistoryBudgetBytes') {
    return { terminalHistoryBudgetBytes: value as number };
  }
```

- [ ] **Step 4: 验证全链路**

```bash
cd ai-digital-life && cargo test -p adl-kernel config
cd ai-digital-life/frontend && pnpm vitest run src/shared && pnpm typecheck
```

Expected: Rust 测试 PASS（既有断言如 `assert_eq!(config.max_concurrent_workspaces, 6)` 不受影响）；前端测试 PASS；typecheck 无错误

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates ai-digital-life/frontend/src/shared ai-digital-life/frontend/src/app/utils
git commit -m "feat(terminal): add terminal history budget preference"
```

---

### Task 16: 「终端」设置组

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal-settings/TerminalSettings.tsx`
- Modify: `ai-digital-life/frontend/src/app/kernel/types.ts`
- Modify: `ai-digital-life/frontend/src/app/components/settings/SettingsNav.tsx`
- Modify: `ai-digital-life/frontend/src/app/components/settings/SettingsPanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/settings.ts`、`ai-digital-life/frontend/src/app/i18n/en-US/settings.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal-settings/__tests__/TerminalSettings.test.tsx`

**Interfaces:**
- Consumes: `DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES`（Task 15）、`TERMINAL_HISTORY_BUDGET_FOLLOW_DISK`（Task 5）、`useAppStore().updatePreferences`、`window.digitalLife.systemMonitor.snapshot`
- Produces:
  - `SettingsGroupId` 增加 `'terminal'`
  - `TerminalSettings()` 组件
  - `budgetOptionsGb: number[]`（`[1, 2, 5, 10, 20]`）、`budgetBytesFromGb(gb: number): number`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/features/terminal-settings/__tests__/TerminalSettings.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalSettings, budgetBytesFromGb, budgetOptionsGb } from '../TerminalSettings';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ appInfo: { config: { terminalHistoryBudgetBytes: 1 << 30 } } }),
    { getState: () => ({ updatePreferences: vi.fn() }) },
  ),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      settingsTerminal: '终端',
      settingsTerminalHistoryGroupDesc: '管理终端的历史存储与显示行为',
      settingsTerminalHistoryBudget: '只读历史磁盘预算',
      settingsTerminalHistoryBudgetDesc: '低于上限时不会自动删除任何历史；超过后才按最旧优先淘汰',
      settingsTerminalHistoryBudgetCustom: '自定义…',
      settingsTerminalHistoryBudgetFollowDisk: '跟随磁盘剩余空间',
      settingsTerminalHistoryBudgetFollowDiskDesc: '按系统盘剩余空间估算上限，并预留 1GB 给系统',
      settingsTerminalHistoryBudgetUsed: '已用 {used}，上限 {limit}',
    },
  }),
}));

describe('budgetOptionsGb / budgetBytesFromGb', () => {
  it('档位与换算正确', () => {
    expect(budgetOptionsGb).toEqual([1, 2, 5, 10, 20]);
    expect(budgetBytesFromGb(2)).toBe(2 * (1 << 30));
  });
});

describe('TerminalSettings', () => {
  it('渲染预算设置项与当前档位', () => {
    render(<TerminalSettings />);
    expect(screen.getByText('只读历史磁盘预算')).toBeTruthy();
    expect(screen.getByRole('combobox')).toHaveProperty('value', String(1 << 30));
  });

  it('包含「跟随磁盘剩余空间」与「自定义…」选项', () => {
    render(<TerminalSettings />);
    expect(screen.getByText('跟随磁盘剩余空间')).toBeTruthy();
    expect(screen.getByText('自定义…')).toBeTruthy();
  });

  it('切到自定义档时出现数字输入框', async () => {
    render(<TerminalSettings />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'custom');
    expect(screen.getByRole('spinbutton')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/features/terminal-settings/__tests__/TerminalSettings.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: Write minimal implementation**

`kernel/types.ts`：

```ts
export type SettingsGroupId =
  | 'general'
  | 'workspace'
  | 'shortcuts'
  | 'terminal'
  | 'browser'
  | 'dsh';
```

`SettingsNav.tsx` 的 `GROUPS` 追加（放在 `workspace` 之后）：

```ts
  { id: 'terminal', labelKey: 'settingsTerminal' },
```

`SettingsPanel.tsx`：

```tsx
import { TerminalSettings } from '../../features/terminal-settings/TerminalSettings';

const SETTINGS_COMPONENTS: Partial<Record<SettingsGroupId, React.ComponentType>> = {
  shortcuts: KeybindSettings,
  workspace: WorkspaceSettings,
  terminal: TerminalSettings,
  browser: BrowserSettings,
  dsh: DshSettings,
};
```

```tsx
// src/app/features/terminal-settings/TerminalSettings.tsx
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import {
  TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES,
  TERMINAL_HISTORY_BUDGET_FOLLOW_DISK,
} from '@features/terminal/terminalHistoryBudget';

/** 预设档位（GB）。1 GiB = 1 << 30，与偏好默认值口径一致。 */
export const budgetOptionsGb = [1, 2, 5, 10, 20];

export function budgetBytesFromGb(gb: number): number {
  return gb * (1 << 30);
}

const CUSTOM_VALUE = 'custom';
const FOLLOW_DISK_VALUE = 'follow-disk';

function formatBytes(bytes: number): string {
  if (bytes >= 1 << 30) {
    return `${(bytes / (1 << 30)).toFixed(bytes % (1 << 30) === 0 ? 0 : 1)} GB`;
  }
  return `${Math.round(bytes / (1 << 20))} MB`;
}

/**
 * 「终端」设置组。
 *
 * 预算是**占用上限**而不是预留空间；低于上限永不自动删除；两种模式都至少保留最近 20 段
 * （见 terminalHistoryBudget 的淘汰实现）。这些语义都在文案里讲清楚，避免误读。
 */
export function TerminalSettings() {
  const { t } = useTCopy();
  const configured = useAppStore((s) => s.appInfo?.config?.terminalHistoryBudgetBytes);
  const [custom, setCustom] = useState(false);

  const current = configured ?? TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
  const isFollowDisk = current === TERMINAL_HISTORY_BUDGET_FOLLOW_DISK;
  const isPreset = budgetOptionsGb.some((gb) => budgetBytesFromGb(gb) === current);

  const apply = useCallback((bytes: number) => {
    void useAppStore.getState().updatePreferences({ terminalHistoryBudgetBytes: bytes });
  }, []);

  useEffect(() => {
    setCustom(!isFollowDisk && !isPreset);
  }, [isFollowDisk, isPreset]);

  return (
    <div className="adl-settings-section adl-terminal-settings">
      <SettingsHeader title={t.settingsTerminal} description={t.settingsTerminalHistoryGroupDesc} />

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.settingsTerminalHistoryBudget}</span>
          </div>
          <small>{t.settingsTerminalHistoryBudgetDesc}</small>
        </div>
        <div className="adl-settings-row__control">
          <select
            className="adl-settings-select"
            value={custom ? CUSTOM_VALUE : isFollowDisk ? FOLLOW_DISK_VALUE : String(current)}
            onChange={(e) => {
              const value = e.target.value;
              if (value === CUSTOM_VALUE) {
                setCustom(true);
                return;
              }
              setCustom(false);
              apply(
                value === FOLLOW_DISK_VALUE ? TERMINAL_HISTORY_BUDGET_FOLLOW_DISK : Number(value),
              );
            }}
          >
            {budgetOptionsGb.map((gb) => (
              <option key={gb} value={budgetBytesFromGb(gb)}>
                {gb} GB
              </option>
            ))}
            <option value={CUSTOM_VALUE}>{t.settingsTerminalHistoryBudgetCustom}</option>
            <option value={FOLLOW_DISK_VALUE}>{t.settingsTerminalHistoryBudgetFollowDisk}</option>
          </select>

          {custom ? (
            <input
              type="number"
              className="adl-settings-input"
              min={1}
              max={2000}
              step={1}
              value={Math.max(1, Math.round(current / (1 << 30)))}
              onChange={(e) => {
                const gb = Math.min(2000, Math.max(1, Number(e.target.value) || 1));
                apply(budgetBytesFromGb(gb));
              }}
            />
          ) : null}
        </div>
      </div>

      {isFollowDisk ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <small>{t.settingsTerminalHistoryBudgetFollowDiskDesc}</small>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <small>
            {t.settingsTerminalHistoryBudgetUsed
              .replace('{used}', formatBytes(historyUsedBytes))
              .replace(
                '{limit}',
                isFollowDisk
                  ? t.settingsTerminalHistoryBudgetFollowDisk
                  : formatBytes(current),
              )}
          </small>
        </div>
      </div>
    </div>
  );
}
```

`historyUsedBytes` 的来源：把 `useTerminalPtyLifecycle` 里索引的全局聚合值（各段 `segmentBytes()` 求和）通过 store 暴露为只读快照后在此读取；接入时替换上面的标识符：

```ts
// 在 TerminalSettings 顶部
const historyUsedBytes = useAppStore((s) => s.terminalHistoryUsedBytes ?? 0);
```

文案（zh-CN / en-US 必须同名 key）：

```ts
// zh-CN/settings.ts 追加
settingsTerminal: '终端',
settingsTerminalHistoryGroupDesc: '管理终端的历史存储与显示行为',
settingsTerminalHistoryBudget: '只读历史磁盘预算',
settingsTerminalHistoryBudgetDesc:
  '这是只读历史在磁盘上的占用上限，不是预留空间。低于上限时不会自动删除任何历史；超过后才按「最旧优先」淘汰，并且始终至少保留最近 20 段。',
settingsTerminalHistoryBudgetCustom: '自定义…',
settingsTerminalHistoryBudgetFollowDisk: '跟随磁盘剩余空间',
settingsTerminalHistoryBudgetFollowDiskDesc:
  '按系统盘剩余空间估算上限，并预留 1GB 给系统；磁盘越紧，可保留的历史越少。',
settingsTerminalHistoryBudgetUsed: '已用 {used}，上限 {limit}',
```

```ts
// en-US/settings.ts 追加
settingsTerminal: 'Terminal',
settingsTerminalHistoryGroupDesc: 'Manage terminal history storage and display behavior',
settingsTerminalHistoryBudget: 'Read-only history disk budget',
settingsTerminalHistoryBudgetDesc:
  'This is a usage cap for read-only history, not reserved space. Nothing is deleted below the cap; above it, the oldest entries are evicted first, and the most recent 20 segments are always kept.',
settingsTerminalHistoryBudgetCustom: 'Custom…',
settingsTerminalHistoryBudgetFollowDisk: 'Follow free disk space',
settingsTerminalHistoryBudgetFollowDiskDesc:
  'Estimates the cap from free space on the system drive, reserving 1GB for the system. The tighter the disk, the less history is kept.',
settingsTerminalHistoryBudgetUsed: 'Using {used} of {limit}',
```

- [ ] **Step 4: Run test + i18n 校验**

Run: `pnpm vitest run src/app/features/terminal-settings src/app/i18n && pnpm check:i18n && pnpm typecheck`
Expected: PASS；i18n 覆盖率检查通过；typecheck 无错误

- [ ] **Step 5: 手动验收**

设置面板出现「终端」组；档位、自定义输入、跟随磁盘剩余空间三种方式都能写回且重启后保持；文案解释了「上限而非预留」「低于上限不删除」「至少保留最近 20 段」「跟随磁盘模式预留 1GB」。

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal-settings ai-digital-life/frontend/src/app/kernel ai-digital-life/frontend/src/app/components/settings ai-digital-life/frontend/src/app/i18n
git commit -m "feat(settings): add terminal history budget settings group"
```

---

## Self-Review

### 1. Spec coverage

| Spec 章节 | 对应 Task |
|---|---|
| 2.1 目标（渲染/内存解耦、有预算的无限、分隔符时间与整行、折叠、删除/清空、预算可配、写入模型结构性消除拒收） | 5–10、9、12–14、15–16 |
| 2.2 非目标（不做自定义路径、不改导航器、不写迁移） | Global Constraints + Task 3 边界校验 |
| 2.3 已知边界（环外内容、`3J`、强杀） | Task 6（环回兜底）、Task 7（节流 + scrollback 5000） |
| 3.2 / 3.3 渲染基元（行模型 + DOM） | 1、2、8、9、10 |
| 3.4 写入模型（追加式行块） | 3、6 |
| 4.1 段结构与合成键 | 3 |
| 4.2 行模型与行块 | 1、2、3 |
| 4.3 生命周期（建档 / 追加 / 定稿） | 6、7 |
| 4.4 不做迁移 | 3 |
| 4.5 采集源与采集时机（漏点 A / B） | 7（节流、scrollback 5000）、6（环回） |
| 5.1 预算与两级淘汰 | 5（`selectLeadingChunksToEvict` 为二级） |
| 5.2 纯函数 | 5 |
| 5.3 体积与失败可见性 | 4、6（64 KiB 块上限） |
| 6.1 折行 | 1 |
| 6.2 行高与视觉一致 | 10（`readTerminalCellMetrics`） |
| 6.3 虚拟化与块级懒加载 | 10 |
| 6.4 分隔符 | 9 |
| 7.1–7.3 折叠与行为细节 | 12、14 |
| 7.4 文案 | 13 |
| 8 设置组与友好提示 | 15、16 |
| 10 错误处理 | 4、6、10（「该段历史内容不可用」） |
| 11 测试 | 每个 Task 的 Step 1 / Step 4 |
| 12 双端一致性与影响面 | Global Constraints（不动桥接层与服务端） |
| 13 风险（记录数膨胀、水位失效、孤儿块、单段极大） | 6（环回）、5（按段淘汰 + 二级兜底） |
| 14 实施分期 | Phase 1–4 与之一一对应 |

无缺口。

### 2. Placeholder scan

已排查：无 `TBD` / `TODO` / 「类似 Task N」/ 「适当处理错误」 等写法。

唯一需要在实现时替换的接入点是 **Task 16 的 `historyUsedBytes`**：文中已给出确切来源（各段 `segmentBytes()` 的全局聚合，经 store 暴露为只读快照）与替换代码行，不是模糊占位。

### 3. Type consistency

- `HistoryRun` / `HistoryChunk` / `TerminalHistoryChunkMeta` / `TerminalHistorySegment`：Task 1–3 定义，Task 6、7、10、15 使用一致。
- `chunkKey(sessionId, seq)`：Task 3 定义；Task 6、7、10 使用一致（形如 `s#0`）。
- `extractLines(buffer, fromRow, toRow)`：Task 2 定义；Task 6 的 `BufferSnapshot` 满足其 `{ active, normal }` 形状。
- `write: (key, payload) => Promise<boolean>`：Task 6 定义，Task 7 注入 `terminalOutputStore.save`（Task 4 已改为返回 `boolean`）。
- Task 5 的五个函数在 Task 7、16 中签名与名称一致；`TERMINAL_HISTORY_BUDGET_FOLLOW_DISK` 在 Task 5 与 Task 16 一致。
- Task 12 的 `RegionCollapse` / `RegionName` / 三个判定函数在 Task 13、14 中一致。
- Task 13 的 `TerminalRegionActionsTitles` 与 Task 14 的 `regionActionTitles()` 返回形状一致。
- `DEFAULT_TERMINAL_HISTORY_BUDGET_BYTES`（TS）与 Rust 端 `1 << 30` 口径一致。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-14-terminal-history-regions.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 Task 派发一个全新 subagent，Task 之间由主代理复核；上下文干净、迭代快

**2. Inline Execution** — 在当前会话中按 `executing-plans` 批量执行，带检查点复核

**Which approach?**
