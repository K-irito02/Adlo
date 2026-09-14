# 终端面板：只读历史区与实时终端区重构设计

> **日期：** 2026-09-14
> **状态：** 待复核
> **范围：** 右侧面板-终端面板的「只读历史区 / 实时终端区」渲染架构、跨重启历史生命周期、区域级操作按钮、历史磁盘预算设置
> **关联：** 取代 `2026-09-13-serialize-addon-persistence-design.md` 中「历史用 SerializeAddon 快照 + 单 xterm 回放」的渲染部分；保留其「历史必须与实时终端分离渲染」的核心结论

---

## 1. 问题陈述

### 1.1 用户提出的问题

1. 需要给「只读历史区」与「实时终端区」各加一个共享样式的「收起/展开」按钮，且每个终端标签的收起状态互不影响；鼠标悬停或停留在某区域时，该区域右上角才出现按钮；两个区域不允许同时收起。
2. 需要给两个区域分别加「删除」（只读历史）与「清空」（实时终端）按钮，悬停显露，且排在「收起/展开」左侧；悬停时都要有系统原生 `title` 提示。
3. 只读历史区的日期分隔符有两个问题：**显示的日期是「下次启动应用」的日期，而不是「关闭应用」的日期**；且分隔符没有整行显示、日期没有居中，且不跟随区域宽度变化。
4. 只读历史区的内容无法长期保留，重启多次后较早的历史逐渐消失。
5. （追加）需要把历史磁盘预算做进设置面板，新增「终端」设置组，允许用户自选预算 GB 数或「直到磁盘空间不足为止」，默认 1GB，并配合详细友好提示。

### 1.2 根因（已定位，非推测）

| 现象 | 根因 | 位置 |
|---|---|---|
| 日期显示为「下次启动日期」 | 归档时间 `archivedAt: Date.now()` 只在「会话已死、需要重建」时被调用，即**下次启动**；因此它记录的是启动时刻而非会话结束时刻 | `useTerminalPtyLifecycle.ts` `archiveSessionAsHistory()` |
| 历史逐渐消失 | 硬上限 `MAX_HISTORY_SEGMENTS = 5`，超出部分**连同快照一起被删除**（`terminalOutputStore.delete`） | `terminalHistoryStore.ts` / `useTerminalPtyLifecycle.ts` |
| 分隔符无法整行 / 不跟随宽度 | 分隔符是**写进只读 xterm 缓冲区的 ANSI 文本**（`historySeparator()`），宽度由写入瞬间的 `cols` 决定；xterm 重排只会把它折断或留短，要变化必须全量重放 | `terminalHistoryCompose.ts` / `TerminalHistoryView.tsx` |
| 历史区无法承载大量段 | 全部历史塞进**同一个只读 xterm**，`scrollback` 需按历史总量预留；且 xterm 按 `rows` 预分配行缓冲与画布 | `TerminalHistoryView.tsx` |

### 1.3 关键约束（决定了架构选型）

- **不能继续用一个 xterm 装全部历史**：内存随历史线性增长，且宽度变化必须全量重放。这与「磁盘预算内全保留」根本冲突。
- **不能改成「每段一个只读 xterm」**：`serialize({ scrollback: 1000 })` 的单段快照是千行量级，而 xterm 会按 `rows` 预分配行缓冲与画布（`TerminalHistoryView.tsx` 注释已写明预分配行为）。按 90 列 × 17px 行高、DPR=2 估算，单个挂载段光位图即达百 MB 量级，挂载数段即不可接受。
- 因此**渲染基元定为「行模型 + DOM 文本」**：历史是**已经渲染完的静态屏幕内容**，不需要终端仿真器参与显示。

---

## 2. 目标与非目标

### 2.1 目标

- 只读历史区的渲染与内存占用**与历史总量解耦**，仅与当前可见行数相关。
- 历史在磁盘上是**有预算的无限**：低于预算永不自动删除；越界才按最旧优先淘汰。
- 日期分隔符显示**该会话结束（最后一次活动）时刻**，整行铺满、日期居中、随区域宽度自适应。
- 两个区域支持**按标签独立**的收起/展开，且不可能同时收起；状态跨应用重启持久化。
- 两个区域支持悬停显露的删除 / 清空操作，带原生 `title` 提示。
- 磁盘预算可通过设置面板「终端」组自定义。
- **写作模型对「单次写入体积无界」做结构性消除**：历史改为**追加式行块**，使「超出体积上限被拒收」这一类失败**不可能发生**（而非把阈值调大使其不易发生）。
- 内容完整性以「只剩物理上不可避免的三类丢失」为目标，并把边界显式记录在 §2.3。

### 2.2 非目标

- 不修改实时终端自身的渲染、输入、PTY 生命周期与尺寸协商逻辑。
- 不修改左侧导航器（会话列表 / 命令历史）。
- 不做历史导出、历史搜索、跨标签合并历史视图。
- 不为旧历史数据格式提供迁移（见 4.4）。
- **不实现「自定义保存路径」。** 终端历史与工作区、会话、剪贴板等共用主库 `data.db`，因此路径不可能只对终端生效；给终端单独换路径只能把历史从主库拆出，那等于更换技术方案。路径能力归属**项目级的「应用数据根目录可自定义」子项目**（见 §15），本设计不为它预留接口，也不在「终端」组下放路径项。

### 2.3 已知边界：本设计无法消除的三类丢失

诚实记录边界，避免后续把「物理上不可避免」误判成实现缺陷：

| 边界 | 原因 | 能否解决 |
|---|---|---|
| 超出 xterm scrollback 环的内容 | 源头（内存缓冲）已被环裁掉，持久化层根本看不到 | 不可解。只能调大 `TERMINAL_CAPTURE_SCROLLBACK_LINES` 把边界外推 |
| 被 `\x1b[3J`（清 scrollback）抹掉的内容 | 序列在源头就清掉了 scrollback | 不可解 |
| 进程被强杀时最后一个未落盘的块 | 增量尚未写入即断电 / 被杀 | 不可解，但窗口被压缩到「一个采集周期（500ms）～ 30 秒」以内 |

除此之外的丢失路径（超限拒收、整段被覆盖、采集时机漏采）本设计**全部消除**。这也是与方案 ①（覆盖式快照 + 调阈值）的本质差别：① 只能把边界外推，② 消除边界。

---

## 3. 架构决策

### 3.1 被否掉的方案

| 方案 | 描述 | 否决理由 |
|---|---|---|
| A. 现状增强 | 保留单 xterm，仅调大段数上限与 `scrollback`；宽度变化时全量重放 | 内存随历史线性增长，几百段必然卡顿；与「磁盘预算内全保留」冲突 |
| B. 单 xterm + 分页窗口 | 只放最近 K 段，顶部给「加载更早」入口 | 无法连续滚动到最早历史；仍是单 xterm 模型，宽度变化仍需重放 |
| C-xterm. 每段一个只读 xterm | 分段虚拟列表，每段独立 xterm 画布 | 单段千行 → 行缓冲与画布规模不可接受（见 1.3） |

### 3.2 选定方案：行模型 + DOM 文本 + 行级虚拟化

- 保存时把实时终端的缓冲区内容**提取为结构化行模型**（文本 + 语义样式），持久化为 JSON 字符串。
- 渲染时把行模型按当前宽度折行，用**纯 DOM** 逐行渲染；行高固定，虚拟化以「行」为单位。
- 分隔符是**独立的 DOM 行**，整行铺满与居中由 CSS 天然保证，宽度变化无需任何重放。

选它的直接收益：

- 内存只与可见行数相关，段再长、历史再多都不影响。
- 分隔符整行居中自适应不需要重放逻辑。
- **跨段连续选择复制天然保留**（整片是普通 DOM 文本），而 C-xterm 方案本会失去它。
- 可删除 `@xterm/addon-serialize` 依赖与 `terminalHistoryCompose.ts` 全部「光标推进 / 分隔条拼接 / 缓冲区扫描」逻辑。
- 折叠、删除、清空、预算等需求全部落在普通 React + CSS 上，无双端差异。

### 3.3 代价（已与用户确认）

- 持久化格式从「xterm 序列化快照、一段一条」换成「行模型 JSON、一段多块」，**旧历史作废一次**（产品未发布，按项目规则不写迁移）。
- 保真度边界：文字、前景/背景色（按主题解析）、粗体/斜体/下划线/暗色/反显均保留；**丢失**超链接、光标位置、sixel 等图形字符。
- 序列化体积变大（结构化 JSON 相较 ANSI 文本约 2–3×），在 1GB 预算下无感。
- 需要自实现「按列折行」（含宽字符宽度判定），以保证与终端行为一致且行高统一。

### 3.4 写入模型决策：为什么从「覆盖式快照」改为「追加式行块」

渲染基元定下来之后，还有一个**独立**的决策：历史怎么**写**。两者正交——渲染决定「怎么看」，写入决定「存不丢」。

| 方案 | 原理 | 单次写入体积 | 内容完整性 | 结论 |
|---|---|---|---|---|
| ① 覆盖式快照 | 每次采集重写整段 | **无界**（随终端内容增长） | 超限即拒收；为保可存必须截断 → **必丢**，且丢失不可见 | 否决：只能把边界外推 |
| ② **追加式行块** | 只追加「新冻结的行」组成的块 | **有界且很小**（几十 KB） | 已落盘内容永不被重写；崩溃最多丢一个未落盘的块 | **采用** |
| ③ 旁路采集 PTY 原始流 | 录制原始字节流 | 有界 | 源头无损，但**回放必须有终端仿真器** | 否决：与既定渲染基元冲突，且属 2026-09-13 已否决路线 |

**为什么 ② 是「结构性消除」而不是「缓解」**：拒收类失败的根因是「单次写入体积无界」。② 把体积变成由「两次采集之间新增的行数」决定，**根因消失**——所以它不是把阈值调大使之不易发生。同时它不覆盖已写内容，把「整段冻结在旧状态」也一并消除。

**采用 ② 的代价**：数据层要重写（块索引、冻结行判定与水位、块级淘汰兜底）；存储记录数从「一段一条」变为「一块一条」。**渲染层、交互层、设置层不受影响**——它们消费的是「段 → 行序列」这一抽象，与段内部的块分布无关。

**方案 ③ 的详细否决理由**（记录以免后续重开）：

- 原始流回放必须由终端仿真器解释（清屏、光标定位、TUI），与 §3.2 选定的「行模型 + DOM 文本」**直接冲突**；为回放把 xterm 请回历史区，会重新撞上 §1.3 的 canvas / 缓冲规模上限。
- 2026-09-13 的 spec 已记录：原始输出回放会**重复启动横幅、渲染错乱**，ConPTY 的坐标系与重绘特性使得「把历史喂回终端」必然出问题。
- 要用只能让 headless xterm 在后台回放再产出行模型——每个会话一个实例，成本明显高于 ② 的收益。

---

## 4. 数据模型与归档生命周期

### 4.1 历史段索引（`TerminalHistorySegment`）

```ts
interface TerminalHistoryChunkMeta {
  /** 该块采集时的屏幕行数 */
  lines: number;
  /** 该块 JSON 的 UTF-8 字节数 */
  size: number;
}

interface TerminalHistorySegment {
  sessionId: string;
  /** 该会话最后一次有活动的时刻；分隔符显示它 */
  endedAt: number;
  /** true = 会话仍在进行中 → 只读历史区不渲染它 */
  live: boolean;
  /** 每块的元信息，**下标即 seq**；段的总行数与总体积都是它的聚合值 */
  chunks: TerminalHistoryChunkMeta[];
}
```

- 派生值：`chunkCount = seg.chunks.length`、`lines = Σ chunks[].lines`、`size = Σ chunks[].size`（提供 `segmentLines()` / `segmentBytes()` 两个纯函数）。
- 为什么把**每块**的元信息都存下来，而不是只存聚合值：
  1. 虚拟列表需要**逐块的屏幕行数**才能把「显示行号 → (块, 块内偏移)」算准，不必先加载内容；
  2. 二级淘汰（见 5.1）需要在**不读取块内容**的前提下算出「该丢前几块」；
  3. 元信息体积可忽略（一块一个 `{lines, size}`，1 MiB 的段按 64 KiB 分块也只有 16 条）。

- 持久化沿用 `adl-terminal:history-index`（`terminalHistoryStore`）。
- 只读历史区只渲染 `live === false` 的段，按数组顺序（旧 → 新）回放。
- `startedAt` 等无实际消费方的字段**不引入**（YAGNI）。

**块级存储键（决定存储形态，但不改 IPC 契约）**

每块是一个独立记录，键为合成键 **`${sessionId}#${seq}`**，值是 `JSON.stringify(HistoryChunk)`：

- 现有 `terminalOutput.save / load / delete` 的入参就是 `sessionId: string`，**合成键直接复用该契约，不新增 IPC、不改桥接层**。
- 删除一段 = 删除 `seq = 0 .. chunkCount-1` 的全部键（前端从索引里拿得到 `chunkCount`）。
- 代价：无法用前缀批量删除，也无法在不新增 IPC 的前提下做孤儿文件清理（见 §13）。这是刻意的取舍——换来的是零桥接层改动。

### 4.2 行模型与行块（载荷结构）

```ts
interface HistoryRun {
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

/** 一个行块：一次追加写入的最小单位 */
interface HistoryChunk {
  /** 块序号，从 0 起，按序拼接成一个段 */
  seq: number;
  /** 提取时的列数，作为折行基准 */
  cols: number;
  /** 本块包含的屏幕行，旧 → 新 */
  lines: HistoryRun[][];
}
```

- 存储走合成键：`terminalOutputStore.save(`${sessionId}#${seq}`, JSON.stringify(chunk))` —— **IPC 契约不变**。
- 颜色存**语义值**（调色板下标或直接色），渲染时才解析成当前主题具体颜色 → 切换主题历史会正确重着色。
- 提取规则（逐块、只取新增的冻结行，采集细节见 4.5）：
  - 数据源为 `terminal.buffer.active`；若其 `type === 'alternate'`（vim/less 等备用缓冲区），改用 `buffer.normal`，保持既有「不把备用缓冲区带进历史」的结论。
  - 逐行按单元格扫描，把连续同样式单元格合并为一个 `HistoryRun`；单元格宽度由 `cellWidthOf()` 给出（东亚宽字符占 2 格）。
  - 行尾右裁：裁到最后一个「有字符**或**带非默认背景色」的单元格，避免丢色块，同时不产生大片空行。
  - 默认样式的行只写 `[{ text }]`，属性仅在出现时写入，控制体积。
  - 全为纯空白行且位于块尾时裁去，避免块被空行占满。

### 4.3 生命周期：建档 → 追加 → 定稿

替换现有的「下次启动才归档」模型。**写入语义从「覆盖整段快照」改为「只追加块」**：

| 时机 | 动作 |
|---|---|
| `attachSession` 成功后 | `beginSegment(tabId, sessionId)`：写入 `{ sessionId, endedAt: Date.now(), live: true, chunkCount: 0, lines: 0, size: 0 }`；同时在内存里建立该会话的行水位与当前未满块 |
| 每次采集（**节流**：输出期间最多每 500ms 一次；另有 30 秒周期兜底；以及 `beforeunload`） | `appendChunk()`：把「自水位以来新增的**冻结行**」并入当前未满块；块写满 `TERMINAL_HISTORY_CHUNK_MAX_BYTES` 就落盘并 `seq++`；更新 `endedAt / lines / size / chunkCount`；然后触发一次预算结算 |
| `beforeunload` / 会话结束 | `flushChunk()`：把当前未满块落盘（此时视口区也已冻结，一并采集），水位推进到 `buffer.length` |
| 应用启动 | `finalizeStaleSegments()`：把所有残留的 `live: true` 段置为 `live: false`（PTY 随进程退出必然已死），`endedAt` **冻结在最后一次采集时刻** |
| 标签关闭 / 删除历史 | 删除该标签全部段（含未定稿段）及其 `seq = 0..chunkCount-1` 的全部块 |

**追加语义带来的性质（本设计的核心）**：

1. **已落盘的块永不被重写** → 后续任何写入都不可能损坏或缩短已保存的内容。这是「段内容残缺」被结构性消除的原因。
2. **单次写入体积 = 两次采集之间新增的冻结行数**，处于几十 KB 量级，**不可能撞到任何体积上限** → 「超限拒收」这一类失败不可能发生，而不是"把阈值调大所以不容易发生"。
3. 崩溃时最多丢**最后一个未落盘的块**，而不是整段停在旧状态。

行为保证：

- 正常关闭应用时 `beforeunload` 会写入精确的关闭时刻 → 分隔符显示关闭时间，**即用户要求的语义**。
- 进程被强杀时退回到最后一次采集时刻，误差 ≤ 30 秒。
- 启动路径不再有「补建档」动作，`archiveSessionAsHistory()` 退化为 `finalizeStaleSegments()`。

### 4.4 不做数据格式迁移

按项目规则「未发布产品的开发阶段禁止添加/保留数据格式兼容或旧版本迁移代码」：

- `normalizeHistoryIndex()` 继续只做**边界校验**（丢弃结构非法的条目、`endedAt` 非有限数等），并扩展校验新字段。
- 新字段缺失的旧条目会被丢弃 → 升级后现有旧历史消失一次。这是已确认的取舍，**不写迁移代码**。

### 4.5 采集源与采集时机（两个必须同时修的漏点）

追加式写入能消除「超限拒收」，但**内容完整性还取决于采集**。现有实现有两个**互相独立**的漏点，必须一并修，否则追加式只解决了"写不进去"，没解决"没采到"。

**漏点 A —— 采集源本身是有损环。**
数据来自 `terminal.buffer.active`，其 scrollback 容量由 xterm 的 `scrollback` 选项决定。**超出的行在内存里就已被环丢掉，任何持久化方案都救不回来。**

- 措施：为采集侧把实时终端的 `scrollback` 提到 `TERMINAL_CAPTURE_SCROLLBACK_LINES`（**5000 行**）。它是「两次采集之间最多能积压多少行」的下界。
- 同类参照：VS Code 的 `terminal.integrated.scrollback` 默认 1000，官方解法同样只是「让你调大」——这是**同类产品的共同边界**，不是本项目的实现缺陷。因此它属于 §2.3 的已知边界，而不是本设计要消灭的缺陷。

**漏点 B —— 采集时机是「尾去抖」，不是节流。**
现有实现对每个输出事件 `clearTimeout` 再 `setTimeout(500ms)`（trailing debounce）：**只要输出在持续流动，定时器就被不断重置**，只能靠 30 秒周期兜底。结果是**最多 30 秒的输出未落盘**；若这 30 秒的输出超过 scrollback 容量，超出的行已从源头丢失。

- 措施：改为**节流（throttle）**——输出期间最多每 `TERMINAL_CAPTURE_THROTTLE_MS`（**500ms**）采集一次，并保留 30 秒周期兜底。这样连续输出时也在持续落盘，积压行数被压到「500ms 内新增行数」，远小于 scrollback 容量。

**水位法与环回兜底**

- 每个会话在内存维护**行水位**（已采集到的绝对行号）。冻结行区间为 `[watermark, buffer.active.baseY)`：`baseY` 是 scrollback 行数，视口最底 `rows` 行视为可变、不采集。
- 定稿时采集 `[watermark, buffer.active.length)`，把最终视口内容一并封入最后一块，水位推进到 `length`。
- **环回检测**：scrollback 溢出时 xterm 会裁掉最旧行，绝对行号随之失去意义。若检测到 `baseY` 未按预期增长、或水位超出 `buffer.length`，则**放弃续采，改为以当前缓冲区内容重建整段**（删除该段已落盘的块，从 `seq = 0` 重写）。这是安全退化路径，只在病态场景触发，但必须有——否则会写出错位的历史，比丢失更难排查。

---

## 5. 存储、预算与淘汰

### 5.1 预算模型

| 常量 | 值 | 说明 |
|---|---|---|
| `TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES` | `1 GiB`（`1 << 30`） | 默认预算，与 Rust 偏好默认值一致 |
| `TERMINAL_HISTORY_BUDGET_FOLLOW_DISK` | `0` | 哨兵值，表示「跟随磁盘剩余空间」模式 |
| `TERMINAL_HISTORY_DISK_RESERVE_BYTES` | `1 GiB` | 跟随模式下预留给系统的安全余量 |
| `TERMINAL_HISTORY_MIN_SEGMENTS_KEPT` | `20` | 两种模式都生效的最小保留段数安全阀 |
| `TERMINAL_HISTORY_CHUNK_MAX_BYTES` | `64 KiB` | 单个行块的 UTF-8 字节上限，写满即封块（见 5.3） |
| `TERMINAL_CAPTURE_SCROLLBACK_LINES` | `5000` | 采集侧实时终端的 scrollback 行数（见 4.5） |
| `TERMINAL_CAPTURE_THROTTLE_MS` | `500` | 采集节流间隔（见 4.5） |

- **预算不是预留空间**：应用不会预先占用，只有真实累计到该量才触发淘汰。
- 总量统计**包含进行中的段**（它们确实占用磁盘），但**淘汰只作用于 `live === false` 的段**。
- 淘汰分两级：
  1. **常规（按段）**：按 `endedAt` 升序（最旧优先）逐段删除，直到剩余总量 ≤ 预算；**总是跳过最近 `TERMINAL_HISTORY_MIN_SEGMENTS_KEPT` 段**。
  2. **最后手段（按块）**：若淘汰到只剩 20 段仍超预算（极端情况：单段自身就很大），则对**最旧的那一段**从**最旧的块**开始丢弃，直到回到预算内。
- **为什么常规淘汰按段而非按块**：按块淘汰会让「一段历史只剩后半截」变成常态，而这正是本次要消除的现象形态。按段淘汰的语义是「一段历史要么完整存在、要么整体消失」，可预期、可解释；块级淘汰仅作预算兜底。
- 结算时机：每次 `appendChunk` / `flushChunk` 之后、`finalizeStaleSegments` 之后。
- 跟随磁盘模式下的有效预算：`max(0, 磁盘可用空间 − 1 GiB)`。磁盘可用空间取 `systemMonitor.snapshot()` 返回的 `SystemSnapshot.disks[]`，优先取系统盘（Windows 下 `C:\`），取不到则回退 `disks[0]`。

### 5.2 纯函数（便于单测）

```ts
/** 派生值 */
segmentLines(seg: TerminalHistorySegment): number;
segmentBytes(seg: TerminalHistorySegment): number;

/** 一级淘汰：选出要整段删除的段 */
selectSegmentsToEvict(
  segments: { tabId: string; seg: TerminalHistorySegment }[],
  budgetBytes: number,
): { tabId: string; sessionId: string }[];

/** 二级淘汰：一级淘汰后仍超预算时，算出最旧段要从头部丢弃几块 */
selectLeadingChunksToEvict(oldest: TerminalHistorySegment, overflowBytes: number): number;
```

行为：

- `selectSegmentsToEvict`：仅考虑 `live === false`；按 `endedAt` 升序；跳过最近 `TERMINAL_HISTORY_MIN_SEGMENTS_KEPT` 段；累计到总量 ≤ `budgetBytes` 即停止。
- `selectLeadingChunksToEvict`：从 `chunks[0]` 起累计 `size`，返回使剩余体积 ≤ `overflowBytes` 所需丢弃的最小块数；**至少保留最后一块**（不允许把一段清空成零块）。

### 5.3 单次写入体积与失败可见性

现状：服务端对单次保存有 **200 KiB 硬上限**（`crates/server/src/handlers/terminal_output.rs` 的 `MAX_OUTPUT_BYTES = 200 * 1024`），超限直接返回 `InvalidInput`。这个失败在**三层链路上全部被吞掉**：

| 层 | 行为 | 后果 |
|---|---|---|
| `httpBridge.call()` | 服务端业务错误**不抛异常**，返回 `{ ok: false, error }`（只有网络类异常才走 `catch`） | 调用方看不到错误 |
| `terminalOutputStore.save()` | 只 `catch` 抛出的异常，**不检查 `result.ok`**，超限时照样 `return true`；`console.warn` 仅在网络类异常时触发 | 失败被转换成「成功」 |
| 调用方（现为 `serializeSession()`） | 丢弃 `save()` 的返回值 | 最后一个发现机会也消失 |

结果：**不抛错、不告警、无任何用户可见提示**；`INSERT OR REPLACE` 未执行，库中该会话停留在**上一次成功保存**的内容上 —— 表现为**历史内容静默截断**（段还在，但内容是旧的）。

**与「历史段消失」的区别**（两者外观相似、机制完全不同，极易误诊，故单列）：

| 现象 | 机制 | 表现 |
|---|---|---|
| 段整体不见 | `MAX_HISTORY_SEGMENTS = 5` 淘汰，段记录与快照一并删除 | 历史里缺了整段 |
| 段内容残缺 | 本条 200 KiB 拒收，段记录仍在 | 段在，但内容停在旧状态、缺后半截 |

两类问题里，**「段内容残缺」被本设计结构性消除，「段整体消失」由预算淘汰取代**（见 4.3 / 5.1）。下面只记录与体积和失败可见性直接相关的处置。

**处置措施**

| 措施 | 内容 |
|---|---|
| 结构性消除拒收 | 单次写入 = **一个行块**，上限 `TERMINAL_HISTORY_CHUNK_MAX_BYTES`（**64 KiB**）。因此：<br>① 64 KiB 远低于服务端 200 KiB，**无需改动服务端上限**——这一项原是覆盖式方案的必需项，追加式写入后不再需要；<br>② 单行体积天然有界（一行最多 `cols` 个单元格，即使每格一个样式片段，500 列极端情况也只有 ~15 KiB），所以「块一定能封上」是构造性保证，而不是靠估算与截断 |
| 失败不再被吞 | `terminalOutputStore.save()` 必须**检查 `result.ok`**（而非只 `catch` 异常），失败时返回 `false` 并记录警告；`appendChunk` 据返回值决定是否推进水位——**仅在写入成功后推进**，失败的块留在内存、下一次采集重试（在 scrollback 环尚未裁掉这些行之前） |
| 保留服务端上限 | `MAX_OUTPUT_BYTES = 200 KiB` **不动**。它是防御性上限，不是可调配置；本设计不依赖它，也不修改它 |

**为什么不再需要「从最旧行开始裁剪」**：覆盖式方案里，快照体积无界，只能靠截断保证可存；追加式方案里每次写入的体积由「两次采集之间新增的行数」决定，**天然有界且很小**，所以截断这一步连同它的丢失一起消失了。

---

## 6. 渲染

### 6.1 折行

```
wrapLines(lines: HistoryRun[][], cols: number) -> HistoryRun[][]
```

- 输入：一段的行序列（把各块按 `seq` 顺序拼接所得）+ 当前列数；输出：显示行数组（每个显示行是该行在所有 `cols` 列边界处切片后的结果）。
- 用 `cellWidthOf(char)` 判定单元格宽度，**宽字符跨列边界时不切开**（超出 `cols - 1` 时整体推到下一显示行）。
- 结果可缓存，缓存键为 `sessionId + cols`。
- 为什么必须自实现：终端按列硬折行，CSS 自动换行会在空格处断行，导致与终端行为不一致；且行数不一致会让虚拟化的行高与偏移失真。

### 6.2 行高与视觉一致性

- 行高、字符宽**从实时终端的 DOM 实测**（`.xterm-screen` 的 `offsetWidth / cols`、`offsetHeight / rows`），写入 CSS 变量 `--adl-terminal-cell-width` / `--adl-terminal-cell-height`。
- 历史行使用与实时终端相同的字体族（`readTerminalFontFamily()`）与 13px 字号、`white-space: pre`、固定 `line-height`。
- 保证两侧视觉延续：底色、字体、行距、颜色解析口径一致。

### 6.3 虚拟化

- 行高固定 → 偏移量可精确计算：`top = 行号 × 行高`，**无需测量、无滚动跳动**。
- 自实现（不引入第三方虚拟列表库，逻辑约 60 行）：按 `scrollTop` 计算可见行区间并上下各留一屏缓冲，未挂载区间用等高占位元素撑起总高度。
- 块级懒加载：某个块进入挂载窗口才 `terminalOutputStore.load(`${sessionId}#${seq}`)` → `JSON.parse` → 折行 → 缓存。
- **估高校正**：未加载的段用 `lines × 行高` 估高；加载后发现真实显示行数不同（渲染宽度 ≠ 保存宽度导致）时修正该段高度，并**以当前视口锚定行为基准**调整 `scrollTop`，避免位置跳动。校正结果缓存在内存（`Map<sessionId, { cols, displayLines }>`）。
- 初始滚动位置：最底部（与现有 `scrollToBottom()` 行为一致）。

### 6.4 日期分隔符

- 独立的 DOM 行：`[flex:1 的横线] [居中文本] [flex:1 的横线]`，天然整行铺满、日期居中、随宽度自适应，**不参与折行计算**。
- 在虚拟列表中，分隔符是**与内容行并列的独立行项**，紧跟在其所属段的最后一个显示行之后；它自身高度固定（与行高同阶），计入总高度与偏移计算。
- 显示的文本取自该段的 `endedAt`，格式沿用既有固定样式 `HH:MM:SS YYYY-MM-DD`（该格式为用户明确指定、不随 locale 变化，沿用现状，不擅自本地化）。
- 位置保持现状语义：位于该段内容**下方**（表示「这段内容结束于此时刻」）。
- 横线样式：1px 实线，取中性分隔色（与分隔符文字同为次级文本色系），不使用原 `───` 字符。

---

## 7. 交互

### 7.1 折叠状态

```ts
type RegionCollapse = 'none' | 'history' | 'live';
// Record<tabId, RegionCollapse>，持久化于 adl-terminal:region-collapse
```

- `none`（默认）= 两区都展开；`history` = 只读历史区收起；`live` = 实时终端区收起。
- **三态值域天然保证「不可能两个区域都收起」**，无需额外互斥校验。
- 派生可见性：`historyVisible = hasHistory && collapse !== 'history'`；`liveVisible = hasActiveTab && collapse !== 'live'`。
- 持久化：新增前端 store `adl-terminal:region-collapse`，沿用 `makePersistedWriter` 去抖写法；标签关闭时删除对应条目，避免无界增长。
- 标签无历史段时（`hasHistory === false`）该标签的折叠状态视为 `none`。

### 7.2 区域按钮叠加层

| 区域 | 悬停时右上角（左 → 右） | 常驻（仅当它已是唯一可见区域） |
|---|---|---|
| 只读历史区 | **删除** ｜ **收起/展开** | 展开 |
| 实时终端区 | **清空** ｜ **收起/展开** | 展开 |

- 「收起/展开」**只在 `hasHistory === true`（即两个区域都可能显示）时出现**；历史被删除后它自然消失——这正是「只剩实时终端时不再显示收起/展开按钮」的要求。
- 悬停显露沿用项目既有范式：默认 `opacity: 0` + `pointer-events: none`，区域 `:hover` 时恢复；常驻态由状态加类名驱动（不依赖 hover）。
- 按钮组右上角**左移 18px**，避开 xterm 自绘滚动条的 14px 命中带，否则按钮会遮住滚动条拖拽。
- 分界线仅在 `historyVisible && liveVisible` 时渲染；只剩一个区域时该区域以 `flex: 1` 铺满。
- 三个按钮均使用**原生 `title` 属性**（不用组件的自定义 Tooltip），文案全部走 i18n key。

### 7.3 行为细节

| 动作 | 效果 |
|---|---|
| 收起只读历史区 | 历史区不渲染、实时区铺满；实时区按钮转为**常驻「展开」**态 |
| 收起实时终端区 | 实时区不渲染、历史区铺满；历史区按钮转为**常驻「展开」**态 |
| 点击常驻「展开」 | 另一区域恢复渲染，两区都可见，按钮回到悬停显露模式 |
| 点击「删除」（历史） | 清该标签历史索引 + 删除段内全部块（`seq = 0..chunkCount-1`）；折叠状态重置为 `none`（若实时区原本收起则恢复展开）；「收起/展开」按钮随之消失 |
| 点击「清空」（实时） | 等价现有 `handleClear`（xterm `clear()`），只清可见内容，**不动磁盘上的历史** |
| 删除防误触 | **不加二次确认**（用户明确要求），但删除按钮的原生 `title` 必须写清后果 |
| 切换标签 | 各标签使用自己的折叠状态，互不影响 |
| 重启应用 | 折叠状态从持久化恢复 |

### 7.4 文案（i18n，zh-CN / en-US 同步）

| key | zh-CN 文案 |
|---|---|
| `terminalHistoryRegionName` | 只读历史区域 |
| `terminalLiveRegionName` | 实时终端区域 |
| `terminalRegionCollapseTitle` | 收起{region}（另一个区域会铺满剩余空间） |
| `terminalRegionExpandTitle` | 展开{region} |
| `terminalHistoryDeleteLabel` / `Title` | 删除历史 / 删除该标签的全部历史记录（不可恢复） |
| `terminalLiveClearLabel` / `Title` | 清空 / 清空实时终端当前显示的内容（等同 clear 命令） |
| `terminalHistorySegmentUnavailable` | 该段历史内容不可用 |

---

## 8. 设置：新增「终端」组

### 8.1 设置组

- `SettingsGroupId` 增加 `'terminal'`；设置导航新增「终端」组。
- 组件落位 `frontend/src/app/features/terminal-settings/TerminalSettings.tsx`，写法参照现成的 `BrowserPerformanceSettings`（`SettingsHeader` + `adl-settings-row` + `adl-settings-select`）。
- 注册：`SettingsPanel.SETTINGS_COMPONENTS` 与 `SettingsNav.GROUPS`。

### 8.2 设置项：只读历史磁盘预算

- 档位下拉：`1 GB（默认） / 2 GB / 5 GB / 10 GB / 20 GB / 自定义… / 跟随磁盘剩余空间`。
- 选「自定义…」时出现整数输入框，范围 `1–2000 GB`。
- 「跟随磁盘剩余空间」对应存储值 `0`。
- 存储：Rust 偏好 `terminal_history_budget_bytes: u64`，默认 `1 << 30`。

### 8.3 友好提示（用户明确要求）

- 组描述：说明该组管理终端面板的历史与显示行为。
- 设置项描述：
  - 这是**只读历史的行块数据在磁盘上的占用上限**，不是预留空间；
  - **低于上限永不自动删除**；超过后才按「最旧优先」淘汰；
  - 两种模式都**始终至少保留最近 20 段**；
  - 「跟随磁盘剩余空间」按**系统盘**剩余空间估算，并预留 1GB 给系统。
- 实时状态：显示**当前实际占用**（前端按索引 `size` 求和），形如「已用 128 MB / 上限 1 GB」。

### 8.4 跨语言改动（Rust → TS）

| 文件 | 改动 |
|---|---|
| `crates/kernel/src/config.rs` | 新增 `terminal_history_budget_bytes: u64`、`default_terminal_history_budget_bytes()`、`Default` 实现、既有测试断言 |
| `crates/types/src/types/config.rs` | `AppPreferencePatch` 增加 `Option<u64>`；`ConfigSnapshot` 增加带 serde default 的 `u64` |
| `crates/server/config/config.json` | 新增默认键值 |
| `frontend/src/shared/ipc-types.generated.ts` | 两个接口同步新增字段 |
| `frontend/src/shared/defaultPreferences.ts` | 新增默认常量、`getDefaultPreferences()`、`getDefaultForSetting()` |
| `frontend/src/app/i18n/{zh-CN,en-US}/settings.ts` | 新增组名与设置项文案（顶层 key 必须两侧一致） |

---

## 9. 组件与文件清单

### 9.1 新增

| 文件 | 职责 |
|---|---|
| `features/terminal/historyModel.ts` | 行模型类型、`extractHistorySnapshot()`、`wrapSnapshot()`、`cellWidthOf()`、`resolveRunStyle()`（主题色解析） |
| `features/terminal/terminalHistoryBudget.ts` | 预算常量、`selectSegmentsToEvict()`、有效预算换算 |
| `features/terminal/terminalRegionCollapse.ts` | 折叠三态类型、归约逻辑、持久化读写 |
| `components/terminal/TerminalHistoryList.tsx` | 虚拟滚动容器、块级懒加载、按 `chunks[].lines` 精确落位 |
| `components/terminal/TerminalHistoryRow.tsx` | 渲染单个显示行的 runs |
| `components/terminal/TerminalHistoryDivider.tsx` | 日期分隔符 DOM 行 |
| `components/terminal/TerminalRegionActions.tsx` | 区域右上角按钮叠加层（两区共用） |
| `features/terminal-settings/TerminalSettings.tsx` | 「终端」设置组 |

### 9.2 修改

| 文件 | 改动 |
|---|---|
| `features/terminal/TerminalPanel.tsx` | 两区外壳、折叠判定、按钮叠加层接入、分界线渲染条件 |
| `features/terminal/useTerminalPtyLifecycle.ts` | 归档改为建档 / 追加 / 定稿；**采集由尾去抖改节流**（见 4.5）；保存改行块；暴露 `deleteHistoryForTab` |
| `features/terminal/terminalHistoryStore.ts` | 段结构扩展 + 新字段边界校验 |
| `features/terminal/terminalOutputStore.ts` | `save()` 检查 `result.ok` 并如实返回成败（见 5.3）；`load` / `delete` 支持合成键 |
| `features/terminal/terminalXtermPool.ts` | 移除 `SerializeAddon`；采集侧 `scrollback` 提到 `TERMINAL_CAPTURE_SCROLLBACK_LINES`（见 4.5） |
| `components/settings/SettingsNav.tsx` / `SettingsPanel.tsx` | 注册 `terminal` 组 |
| `kernel/types.ts` | `SettingsGroupId` 增加 `'terminal'` |
| `styles/regions/rightpanel/terminal-panel.css` | 历史列表、行、分隔符、按钮叠加层、滚动条样式 |
| `app/icons/terminal-nav.tsx` | 新增 `IconRegionCollapse` / `IconRegionExpand` / `IconClearDisplay` |

### 9.3 删除

- `components/terminal/TerminalHistoryView.tsx`
- `features/terminal/terminalHistoryCompose.ts` 及其测试 `__tests__/terminalHistoryCompose.test.ts`
- 依赖 `@xterm/addon-serialize`

### 9.4 图标规格（依据用户提供的 SVG）

| 图标 | 处理 |
|---|---|
| 收起 | 4 条 stroke 路径，`makeThin(..., 1.5)`。原 SVG 未声明 `stroke-width`（默认 1），在 14px 尺寸下偏细，故取 1.5；如需严格保持原始 1，请在复核时指出 |
| 展开 | 单条 `fill` 路径，`makeFilled('0 0 15 15', ...)` |
| 清空 | 单条 `fill` 路径（橡皮擦），`makeFilled('0 0 24 24', ...)` |
| 删除 | 复用项目既有垃圾桶图标 `IconDelete` |

---

## 10. 错误处理

| 场景 | 处理 |
|---|---|
| 块加载失败 / 缺失 / JSON 解析失败 | 该块渲染为一行提示「该段历史内容不可用」（i18n key），不阻塞同段其它块与其它段 |
| 单块写入失败（网络 / 磁盘 / 服务端） | `appendChunk` **不推进水位**、保留未满块，下一次采集重试（见 5.3）；连续失败到阈值时记录警告 |
| 环回检测触发（scrollback 被裁剪，水位失效） | 放弃续采，以当前缓冲区内容**重建整段**（删除已落盘的块，从 `seq = 0` 重写）（见 4.5） |
| 索引条目结构非法 | `normalizeHistoryIndex()` 在边界丢弃（沿用现有风格，扩展 `chunks` 结构校验） |
| 块删除失败 | 沿用 `terminalOutputStore` 现状：仅记录警告，不回滚已完成的 UI 反馈 |
| `systemMonitor.snapshot()` 失败（跟随磁盘模式） | 回退到默认预算 1 GiB，并记录警告；不阻塞结算 |
| 折行 / 偏移计算异常 | 行数下限保护，避免负偏移；单段异常不影响列表其余部分 |
| 磁盘可用空间低于安全余量 | 有效预算为 0，但**最小保留段数安全阀仍生效**，不会一次性清空历史 |

---

## 11. 测试

项目强制红绿测试（`.agents/rules/mandatory-testing.md`），先写失败测试再实现。

### 11.1 纯函数单测

- `cellWidthOf()`：ASCII = 1、CJK / 全角 = 2、组合字符边界。
- `wrapLines()`：正好等于 `cols`、超出一格、宽字符跨边界不切开、空行、`cols` 变化后行数变化。
- `extractLines()`：样式合段、行尾右裁保留色块、备用缓冲区取 `normal`；给定行区间时只返回该区间的行（水位/冻结行语义）。
- `resolveRunStyle()`：调色板下标（0–15 / 16–255）、直接色、缺省色、`inverse`、暗色。
- 块封块：累计字节数达到 `TERMINAL_HISTORY_CHUNK_MAX_BYTES` 即封块；封块后单块 JSON 的 UTF-8 字节数 ≤ 上限。
- `segmentLines()` / `segmentBytes()`：聚合值等于 `chunks[]` 各项之和。
- `selectSegmentsToEvict()`：未超预算不淘汰、超预算按最旧优先、跳过进行中段、跳过最近 20 段、预算 0 时的安全阀行为。
- `selectLeadingChunksToEvict()`：从头部累计到目标体积、**至少保留最后一块**。
- `normalizeHistoryIndex()`：新字段缺失 / `chunks` 结构非法的条目被丢弃。
- 环回检测：水位失效（`baseY` 未按预期增长 / 水位超出 `buffer.length`）时判定为需要重建整段。
- 折叠归约：三态迁移、删除历史后重置为 `none`、标签关闭清理条目。

### 11.2 组件测试

- 悬停区域时按钮出现，移开后消失；按钮顺序为「删除/清空 在左，收起/展开 在右」。
- 收起某区域后另一区域铺满，且该区域按钮转为常驻「展开」。
- 只剩一个区域（历史被删除 / 标签本无历史）时不渲染「收起/展开」按钮。
- 删除历史后折叠状态重置、实时区恢复展开。
- 每个标签的折叠状态互不影响。

### 11.3 既有测试

- `__tests__/terminalHistoryCompose.test.ts` 随源文件删除。
- `__tests__/terminalSlice.test.ts`、`i18n/__tests__/keys.test.ts`（zh/en 顶层 key 一致性）需通过。

---

## 12. 双端一致性与影响面

- 渲染、折叠、删除、清空、预算结算**全部是纯前端逻辑**；存储沿用既有 `terminalOutput` IPC 契约——**不新增 IPC，`tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 均无需改动**。
- 追加式的「一段多块」通过**合成键**落在既有契约上（见 4.1），因此**服务端也不需要改动**（`MAX_OUTPUT_BYTES` 保持不动，见 5.3）。
- 新增 IPC 面为零；磁盘剩余空间复用既有 `systemMonitor.snapshot`。
- 双端功能行为一致；存储后端差异（SQLite vs IndexedDB）由既有桥接层隔离。

**影响面**：终端面板历史区的一次结构性替换。改动集中在 `features/terminal/`、`components/terminal/`、设置面板，外加**一处 Rust 偏好字段**（预算）。服务端、桥接层、实时终端渲染、PTY 生命周期、导航器均不受影响。

---

## 13. 风险与边界

| 风险 | 缓解 |
|---|---|
| 折行实现与实际终端行为存在细微差异 | 纯函数 + 全覆盖单测；宽字符宽度判定单列测试 |
| 未加载块的行数估算不准导致滚动条微调 | 只影响滚动条比例，不影响可用性；块加载后按真实折行校正，并以视口锚定行保持位置 |
| 结构化 JSON 体积膨胀 | 默认样式行只写文本；块上限 64 KiB；预算可调；设置面板实时显示当前占用 |
| **记录数膨胀**（一段多块 → 存储行数上升） | 块上限 64 KiB 使 1 MiB 的段仅约 16 条记录；淘汰按段执行，一次回收该段全部块 |
| **水位法在 scrollback 环回时失效** | 环回检测 + 安全退化：以当前缓冲区内容重建整段（见 4.5）。触发时该段此前已落盘的块会被删除，属本设计内的已知退化 |
| 升级后旧历史消失 | 已确认取舍（产品未发布、不写迁移）；在实现说明中明确告知 |
| 系统盘判定在非 Windows 环境不准 | 优先匹配系统盘，失败回退 `disks[0]`；设置项文案已注明「按系统盘估算」 |
| 单段极大（远超预算） | 由二级（块级）淘汰兜底，见 5.1；不会误删其它段 |
| 孤儿块（索引丢失但块仍在磁盘） | 本设计不做回收（合成键无前缀删除能力，见 4.1）；最坏情况是磁盘占用高于账面值。列为后续独立项 |

---

## 14. 实施分期

本设计跨度较大，建议按下述顺序实施，每期独立可验证，且均遵循红绿测试：

1. **数据层** —— 行模型提取与折行、行块（封块 / 追加 / 水位 / 环回兜底）、段结构扩展（`chunks[]`）、建档 / 追加 / 定稿、两级预算淘汰，以及**采集时机修正**（尾去抖 → 节流）与采集侧 scrollback 提升。纯函数与单测先行；淘汰按默认常量 1 GiB 即可工作，不依赖设置层。

   > 采集修正必须排在第一期：它是「内容完整性」的另一半——只做追加式写入而不修采集，仍会因尾去抖与环回丢内容（见 4.5）。

2. **渲染层** —— `TerminalHistoryList` / `TerminalHistoryRow` / `TerminalHistoryDivider` 替换 `TerminalHistoryView`；删除 `terminalHistoryCompose.ts` 与其测试、移除 `SerializeAddon` 依赖。虚拟化按「块」组织行区间（用 `chunks[].lines` 精确落位）。
3. **交互层** —— 折叠三态与持久化、区域按钮叠加层、删除与清空接入。
4. **设置层** —— Rust 偏好字段 → TS 类型 → 「终端」设置组与文案。

依赖关系：渲染层依赖数据层的行模型；交互层的「删除」依赖数据层的删除接口；设置层的预算值只作为数据层淘汰策略的输入，因此可以最后做。

---

## 15. 范围外：已识别但独立立项的子项目

以下两项**不在本设计范围内**，记录在此以免回头重新推导。二者与本设计**无依赖关系**，可各自独立走「设计 → 计划 → 实现」。

### 15.1 子项目 A —— 应用数据根目录可自定义 + 迁移 + 旧目录清理

**需求来源**：用户要求「项目中所有数据，除非必须在系统 C 盘的情况下，其它都支持用户自定义路径，然后迁移并删除旧数据及目录」。

**为什么不能落在终端面板**：终端历史与工作区、会话、任务、审批、剪贴板共用主库 `data.db`（`crates/server/src/engine.rs` 打开）；`data_dir` 下还有 `downloads.db`、`config/config.json`、`dsh-versions/`、site-meta 缓存、剪贴板缩略图、`.adl-logs`。移动 `data.db` 就是移动整个应用数据，路径能力天然是**全局**的。给终端单独换路径只能把历史从主库拆出，属于更换技术方案，已被用户否决。

**已核实的关键约束**（供 A 的设计直接使用）：

| 事实 | 影响 |
|---|---|
| `data_dir` 由 `src-tauri/src/setup.rs::resolve_data_dir()` 解析（`app_data_dir()`，Windows 默认在 C 盘） | 搬迁入口就这一处 |
| adl-server 子进程由 `AdServerHandle::spawn()` 以 `--data-dir <path>` 启动 | 换路径必须重启应用，不能热切换 |
| 主库在进程启动时即被打开 | 迁移必须发生在**任何 DB 打开之前**，因此流程只能是「选择路径 → 迁移 → 提示重启」 |
| `data_dir` 下的数据种类是**已知白名单** | 「旧目录清理」可按白名单逐类删除后 `remove_dir`（非空即失败，天然兜底），比递归删除安全 |
| 用户已定策略 | 只删「属于本项目的文件」；目录中若存在用户自行放入的资源，保留目录本身 |

**建议的全局设置落位**：不放「终端」组；建议「通用」组或新增「存储」组。

### 15.2 备注 —— 服务端单段体积上限的后续复核

按 5.3，本设计**不修改** `MAX_OUTPUT_BYTES`（200 KiB 保留为防御性上限）——单次写入被块上限（64 KiB）压在它之下。若后续子项目 A 改变存储落点，该上限位于**保存路径上的校验**，应一并复核。
