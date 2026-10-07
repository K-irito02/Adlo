# 终端多窗口布局改造设计（彻底移除只读历史 + 一个终端标签内多终端窗口）

- 日期：2026-10-07
- 状态：待用户复审
- 影响工作区：`ai-digital-life/`
- 前置设计：`2026-09-14-terminal-history-regions-design.md`（本设计**整体废弃**该历史区方案）

## 1. 背景与目标

当前「一个终端标签」在**两处宿主**（中间部分 `CenterTerminalView`、右侧面板 `TerminalPanel`）中只有一个实时终端窗口，并附带一个「只读历史」区（会话结束即归档、按标签跨重启累积、DOM 虚拟列表回放）。用户已有新的交互构想，决定**彻底删除只读历史功能**，并把「一个终端标签」升级为**可容纳多个实时终端窗口**的容器。

### 目标

1. **彻底删除只读历史**：两处 UI、前端归档链、设置面板「存储」组内的「终端历史磁盘预算」、Rust/SQLite/IPC 全链路一并移除，不留兼容层。
2. **一个终端标签内多终端窗口**：两处工具栏新增「增加终端」按钮，点击即在该标签的实时显示区追加一个**独立 PTY 会话**窗口，数量无上限。
3. **自适应自动布局 + 手动调整**：
   - 自动布局：窗口数变化时按网格自动均分。
   - 手动调整两种模式（工具栏分段选择器切换）：
     - **均分+比例拖拽**：拖拽窗口之间的边界线，按比例调整相邻行列。
     - **自由像素拖拽**：拖拽窗口边缘/角/体，自由改变尺寸与位置。
   - 「恢复自动布局」按钮一键还原为自适应自动均分状态。
4. **自定义布局卡片**：拖拽排序、交换位置模式、双击标注（限 1 字符）。
5. **卷帘门式裁剪**：窗口过小/过多导致显示区不足时，内容按最小值保持、超出部分裁剪隐藏，改由项目自定义水平/垂直滚动条滑动查看。
6. **每个终端窗口动作**：清空内容（title 改为「清空内容」）+ 最大化/还原，功能保留。
7. **按标签独立持久化**：关闭应用前未关闭的终端标签，重启后恢复窗口数量/顺序/标注/布局，并各自新建 shell 会话。

### 非目标

- 不删除「清空」功能（与 `xterm.clear()`、历史无关）。
- 不做窗口内嵌套分屏（N 个窗口为**平铺**，不构成树形嵌套）。
- 不引入分阶段兼容层或旧数据迁移代码（未发布阶段规则）：旧 `adl:terminal.viewPrefs` 键直接不读取、不迁移。
- 不改变 PTY 后端能力；浏览器模式复用现有 `pty.*` mock（多 session 已支持）。

## 2. 术语

- **终端标签（TerminalTab）**：`terminalTabs` 中的一条记录，`location` 为 `'panel'` 或 `'center'`，排他。
- **终端窗口 / 窗格（TerminalPane）**：一个终端标签内的一个实时终端窗口，对应一个**独立 PTY 会话**。
- **显示区（pane grid）**：终端标签内承载全部窗格的区域（原「实时终端区域」）。
- **活动窗格（activePaneId）**：当前获得焦点的窗格。
- **布局模式（layout.mode）**：`'equal'`（均分+比例拖拽）或 `'free'`（自由像素拖拽）。
- **自动布局**：`mode='equal'` 且各行列比例为均分、无自由 rect 的状态。

## 3. 总体架构

```
中间部分 CenterTerminalView ─┐
                             ├─ 同一 TerminalPaneGrid 渲染器 + 同一 useTerminalPaneLayout
右侧面板 TerminalPanel ──────┘
        │
        ▼
terminalPtyRuntime（应用级单例，PTY 会话/输出订阅/池）
        │  身份：{ tabId, paneId, sessionId }
        ▼
per-tab 持久化：adl:terminal.tabs（panes 结构） + adl:terminal.paneLayout（布局）
```

核心机制：

1. **同一渲染器、两处复用**：新增 `TerminalPaneGrid` 组件承载窗格网格、边界线、卷帘门裁剪与自定义滚动条；两处宿主各自装配工具栏后复用同一网格。
2. **窗格身份取代标签身份**：PTY 运行时从「per-tab」升级为「per-pane」，`sessionId` 归属窗格。
3. **布局与结构分离持久化**：窗格「有哪些/什么顺序/标注」随标签结构；「怎么排布」按 tabId 存独立布局键，二者均按标签独立、互不影响。

## 4. 删除范围（只读历史全链路 + 存储预算块）

### 4.1 前端 UI / 组件

- `TerminalPanel.tsx` / `CenterTerminalView.tsx`：移除只读历史区、拖拽分界线、区域折叠（`regionCollapse`）、删除历史、最大化/还原的「历史区」分支。
- 删除文件：`components/terminal/TerminalHistoryList.tsx`、`features/terminal/terminalHistoryStore.ts`、`terminalHistoryCollector.ts`、`terminalHistoryBudget.ts`、`terminalRegionCollapse.ts`、`terminalOutputStore.ts`、`useTerminalViewPrefs.ts`（由新布局 Hook 取代）。
- `terminalXtermPool.ts`：删除 `readTerminalCellMetrics` 及其行高换算（仅历史虚拟列表使用）。
- `TerminalRegionActions.tsx`：去掉「删除历史」；保留「清空内容」「最大化/还原」，改为**每窗格**叠加层。
- `historyModel.ts`：若无其它消费者一并删除（实施前用 grep 复核）。
- `useTerminalPtyLifecycle.ts` / `useTerminalTabActions.ts` / `useTerminalViewport.ts`：移除历史版本订阅、`historySegments`、`deleteHistoryForTab` 等。
- `useTerminalPanel.ts` / `useTerminalView.ts`：移除历史与折叠态相关字段与动作。

### 4.2 运行时（`terminalPtyRuntime.ts`）

移除：`collectors`、`throttled`、`historyIndex`、`subscribeHistory` / `getHistoryVersion` / `bumpHistory`、`checkpointTimer`、`beforeunload` 落盘、Tauri `onCloseRequested` 的 flush 落盘链、`settleHistoryBudget`、`finalizeSegment` / `finalizeStaleSegments` / `upsertHistoryEntry` / `persistCollected*` / `deleteChunksForSession` / `evictStaleChunksForRebuild` / `settleRebuild` / `deleteHistoryForTab` / `deleteSegmentRecords` / `collectThrottled` / `createThrottledRunner`（若他处不用）。

单例保留：PTY 会话表、OSC 9;9 目录记忆、xterm 池、激活汇流、输出订阅、`ensureStarted`。

### 4.3 设置 + i18n

- 删除 `features/storage-settings/TerminalHistoryBudgetSection.tsx` 及其测试。
- `StorageSettings.tsx` 摘除该区块的导入与渲染；`storageAtDefault.ts` 摘除预算默认判定；`preferencesMerger.ts` 摘除预算钳制。
- 数据库说明文案中「终端只读历史」一并改写。
- i18n（`zh-CN` / `en-US` 双份）删除：`terminalHistory*`、`terminalDividerLabel`、`terminalViewSingle`、`terminalViewDual`、`terminalSwapAreas`、`settingsTerminalHistoryBudget*`、`storageTerminalBudget*` 等键。

### 4.4 Rust + IPC

- `crates/kernel/src/config.rs`、`crates/types/src/types/config.rs`：删除 `terminalHistoryBudgetBytes` 字段。
- `src-tauri/src/commands/app.rs`：删除预算钳制逻辑。
- `crates/server/src/handlers/terminal_output.rs`、`crates/migration` 中 `terminal_output` 表与仓储：删除（该 IPC 仅服务只读历史）。
- `frontend/src/shared/ipc/terminal-output.ts`、`frontend/src/mock/mock-terminal.ts`：删除对应方法与 mock。
- 相关测试同步删除/改写（`terminalHistory*`、`terminalOutputStore`、`terminalHistoryEviction/Collector/List/Budget` 等）。

## 5. 数据模型

### 5.1 窗格与标签（store）

```ts
interface TerminalPane {
  id: string;                 // createUiId('pane')，稳定不变
  sessionId?: string;         // PTY 会话，重启后忽略并重建
  profile: TerminalProfile;   // 该窗格的 shell
  label?: string;             // 自定义布局卡片标注，长度 ≤ 1 字符（含中文）
  colorIndex: number;         // 自定义布局卡片颜色索引
}

interface TerminalTabState {
  id: string;
  workspaceId: string;
  title: string;
  profile: TerminalProfile;   // 本标签「新建窗格」的默认 shell（Shell 选择器改它）
  panes: TerminalPane[];      // 至少 1 个
  activePaneId?: string;
  isPinned: boolean;
  pinnedAt?: number;
  sortOrder: number;
  location?: TabLocation;
}
```

- 移除标签级 `sessionId` 与 `status`；标签状态由 panes 派生（全部 `terminated` 且无 session → `terminated`）。
- `isTerminalTabState` 校验器扩展 `panes`；归一化缺省为「单窗格」。
- 新增 store 动作：`terminalAddPane(tabId, profile?)`、`terminalRemovePane(tabId, paneId)`、`terminalUpdatePane(tabId, paneId, patch)`、`terminalReorderPanes(tabId, orderedIds)`、`terminalSwapPanes(tabId, a, b)`、`terminalSetActivePane(tabId, paneId)`。
- `terminalCreateTab` 初始创建 1 个窗格。

### 5.2 布局（per-tab 持久化）

键：`adl:terminal.paneLayout`（替代 `adl:terminal.viewPrefs`）。

```ts
interface TerminalPaneLayout {
  mode: 'equal' | 'free';
  colFractions: number[];     // equal：各列宽度比例（总和 1）
  rowFractions: number[];     // equal：各行高度比例（总和 1）
  rects: Record<string, { x: number; y: number; w: number; h: number }>; // free：归一化 0..1
}

type TerminalPaneLayoutMap = Record<string /* tabId */, TerminalPaneLayout>;
```

- `equal` 的网格：`cols = ceil(sqrt(N))`、`rows = ceil(N / cols)`；`fractions` 缺省均分。
- `free` 的 `rects` 缺省由自动网格换算；随容器尺寸缩放（存归一化值）。
- 归一化：越界/缺失回退自动布局默认；`fractions` 长度与当前行列不一致时按均分重建。

## 6. 布局引擎

### 6.1 自动布局

窗格数量变化（增/删/排序）后，若处于自动状态（`equal` + 均分），按 `cols/rows` 重新均分。渲染用 CSS Grid，`grid-template-columns/rows` 取各 fraction。

### 6.2 均分+比例拖拽（`mode='equal'`）

- 在相邻列之间渲染竖向边界线、相邻行之间渲染横向边界线。
- 拖拽边界线：调整相邻两条轨道 fraction（总和守恒，各设最小像素下限）；拖拽期间直接写 CSS 变量（不逐帧 setState），松手提交 store 并落盘。
- 复用现有分界线拖拽手法（`setPointerCapture` + rAF 节流 + 项目自定义光标）。

### 6.3 自由像素拖拽（`mode='free'`）

- 窗格绝对定位，使用 `rects`；拖拽窗格边缘/角改变 `w/h`、拖拽窗格体移动 `x/y`。
- 归一化存储，容器缩放时等比映射。
- 各边设有最小像素；不可重叠策略按「后拖者覆盖/夹取」处理（详见实现计划）。

### 6.4 卷帘门式裁剪 + 自定义滚动条

- 网格容器设最小尺寸 `min-width = MIN_PANE_W × cols`、`min-height = MIN_PANE_H × rows`。
- 外层包裹 `overflow: auto` 容器，使用项目自定义水平/垂直滚动条。
- 显示区小于最小尺寸时，窗格不继续压缩，超出部分被裁剪隐藏，由滚动条滑动查看。

### 6.5 操作

- 工具栏分段选择器在 `均分 / 自由` 间切换 `mode`。
- 「恢复自动布局」：`mode='equal'` + `colFractions/rowFractions` 归一均分 + 清空 `rects`。

## 7. 工具栏改造（两处）

### 7.1 图标（`frontend/src/app/icons/terminal-pane.tsx`）

- `IconAddTerminal`：方形加号，`makeFilledStroked('0 0 256 256', …)`，`currentColor`。
- `IconAutoLayout`：双向环绕箭头，保留 `opacity="0.4"` 分组，写自定义组件（需承载分组，`makeFilled` 不支持），`fill/stroke = currentColor`。
- `IconCustomLayout`：魔棒/自定义图标，`makeFilledStroked`。

> 均不内联、不使用硬编码 `#ffffff`，统一 `currentColor` 以适配亮暗主题。

### 7.2 布局

- 分段选择器：`单列/双列` → `均分 / 自由`（映射 `layout.mode`）。
- 移除「交换历史与实时终端位置」按钮；`IconAreaSwap` 若无其它消费者一并删除。
- 操作组：`增加终端` · `恢复自动布局` · `自定义布局` · 菜单（更多操作）。
- 右面板左组保留「导航折叠 + Shell 选择器」；中心区保持左段布局控件、右段菜单的既有顺序。

## 8. 窗格动作

- 每个窗格右上角叠加层：`清空内容` + `最大化/还原`。
- `清空内容` title 由「清空实时终端当前显示的内容（等同 clear 命令）」**改为「清空内容」**；行为不变（`xterm.clear()` + 滚到底部）。
- `最大化`：该窗格独占显示区（其余隐藏）；`还原`：回到布局。最大化为**临时 UI 态**，不持久化，增删窗格/重启/切模式即复位。

## 9. 自定义布局卡片

- 点击「自定义布局」按钮弹出锚定卡片；点击外部 / Esc 关闭。
- **方块**：数量 = 当前标签窗格数，按 `panes` 顺序排列；`colorIndex` 取自内置调色板，保证同标签内每块各不相同。
- **拖拽排序**：卡片内长按拖动方块 → `terminalReorderPanes`。
- **交换模式**：开启后点选两个方块（高亮）→ 点「确认交换位置」按钮 → `terminalSwapPanes` 应用到显示区。
- **双击标注**：复用终端标签重命名的内联编辑交互，输入**限 1 字符**（一个简体中文字计 1 字符），回车/失焦提交写入 `pane.label`，超出拒绝。
- 卡片反映顺序/颜色/标注，与布局模式解耦（两种模式下均可用）。

## 10. 持久化与恢复

- **按标签独立**：结构（`panes`）随 `adl:terminal.tabs`；布局（`paneLayout`）存 `adl:terminal.paneLayout`（按 tabId）。标签之间互不影响。
- 持久化内容：`panes`（顺序、`profile`、`label`、`colorIndex`）、`activePaneId`、`paneLayout`（`mode`/`fractions`/`rects`）。`sessionId` 落盘但**重启忽略**。
- **恢复**：还原结构与布局后，为每个窗格**新建 shell 会话**（`恢复结构开新会话`）。
- **关闭标签**：剪掉其 `paneLayout` 与窗格记录（同现有折叠态剪枝思路），丢弃其布局。
- 归一化：数据缺失/损坏 → 回退「单窗格 + 自动布局」；旧 `adl:terminal.viewPrefs` 键不读取，不写兼容层。

## 11. 测试与验收

### 11.1 红绿测试覆盖

- 网格排布数学：`cols/rows` 计算、fraction 归一与最小钳制。
- 比例拖拽：相邻轨道守恒、下限夹取。
- 自由拖拽：rect 归一、缩放映射、最小尺寸夹取。
- 窗格生命周期：增/删/关窗格只杀对应 session、关标签杀全部 session、池释放。
- 排序 / 交换：`terminalReorderPanes` / `terminalSwapPanes` 结果与渲染顺序一致。
- 标注：限 1 字符（含中文），超长拒绝。
- 持久化：归一化回退、tabId 剪枝、重启恢复结构与布局。
- 双端一致：Tauri 与浏览器 preview 行为一致（mock 多 session）。

### 11.2 删除与改写既有测试

- 删除历史相关测试文件；改写 `CenterTerminalView.test.tsx`、`TerminalPanel` 相关测试的工具栏与区域断言；删除存储预算区块测试。

### 11.3 质量门

- `pnpm --dir frontend run lint`
- `npx tsc --noEmit`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace`
- `pnpm --dir frontend run test`

### 11.4 文案

- 所有新增可见文案（按钮 / Tooltip / aria-label / 卡片 / 标注提示）走 i18n key，zh-CN 与 en-US 双份。

## 12. 风险与取舍

- **PTY 身份升级**：从 per-tab 到 per-pane 触及 `terminalPtyRuntime` 与全部调用点，回归面较大；以红绿测试与双端手工验证兜底。
- **自由拖拽的重叠语义**：自由模式下窗格可能重叠/越界，采取「最小尺寸 + 夹取」而非窗口管理器的吸附平铺；如需更强约束再迭代。
- **删除历史后数据库瘦身**：`terminal_output` 表删除属破坏性 schema 变更；未发布阶段可接受，需迁移脚本同步移除建表。
- **大改动一次性落地**：按「先删历史 → 再多窗格结构 → 再布局引擎 → 最后自定义卡片」的批次推进，每批红绿测试通过。

## 13. 实施批次（供 writing-plans 展开）

1. **批次 A**：全链路删除只读历史 + 存储预算块；空出「实时显示区」为单窗格。
2. **批次 B**：窗格数据模型 + `terminalPtyRuntime` per-pane 化 + 「增加终端」按钮；单列平铺。
3. **批次 C**：布局引擎（自动 / 均分比例 / 自由像素 / 卷帘门裁剪 + 自定义滚动条 / 恢复自动布局）。
4. **批次 D**：自定义布局卡片（排序 / 交换 / 标注）+ 持久化恢复收尾。
