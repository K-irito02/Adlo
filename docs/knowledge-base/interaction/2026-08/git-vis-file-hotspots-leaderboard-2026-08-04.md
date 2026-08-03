# Git可视化 文件热点排行榜：git 路径显示与滚动/高度治理 — 2026-08-04

来源：文件热点（File Hotspots）排行榜系列改进 + closing-workflow 多 Agent 复审修复。

## 经验教训

### 1. `git log --numstat` 对非 ASCII 路径默认做 C 转义 → `core.quotepath=false`

`git log --numstat` 输出中，含非 ASCII 字符的路径默认被 C 引号转义（如 `"Logo\345\233\276\346\240\207..."`），直接当路径用会显示乱码。命令前加 `-c core.quotepath=false` 可让路径以原始 UTF-8 返回（如 `Logo图标设计`）。

- Rust：`crates/workspace/src/git/git_vis/hotspots.rs` 的 `numstat_args` 前置 `-c core.quotepath=false`。
- 浏览器预览：`frontend/dev/previewWorkspaceService/gitVisualization.ts` 的 `buildFileHotspotsArgs` 同步处理（双端一致）。
- 注意：`core.quotepath=false` 只影响引号转义，含 tab/引号/换行的极端文件名仍会被 git 按 `quote.c` 规则 C 引号化（罕见，可忽略）。

### 2. 路径文本禁用 `direction: rtl`（bidi 重排陷阱）

为"长路径显示尾部"用 `direction: rtl` 会让整段文本按 bidi 重排：`.trae` 显示成 `trae.`、引号/花括号/`=>`（git 重命名记法）被移到错误位置，显示与复制内容不一致。改用普通 LTR + `text-overflow: ellipsis`，保证显示 === 实际数据。文件名本身在名称列展示，路径列截断尾部可接受。

### 3. `--until=YYYY-MM-DD` 不含当天 → 复用 `build_time_filter`

git 把裸 `YYYY-MM-DD` 的 `--until` 解释为当天 00:00，导致结束日整日被排除（与其它图表不一致）。统一复用 `build_time_filter`（Rust）/ `buildTimeFilterArgs`（预览），对裸日期追加 `T23:59:59`，避免各图表的 until 语义漂移。

### 4. 虚拟滚动容器：DOM scrollTop 与 React 状态必须同步

虚拟化列表在模式/数据切换时，DOM `scrollTop` 会保留旧值，而状态被重置，二者不一致会导致视口内容消失/截断。治理要点：
- 模式/下钻切换时：`useLayoutEffect` 按 `(mode, drillPath)` 恢复各自保存的滚动位置。
- `sorted.length` 变化（数据刷新收缩）时：从 `containerRef.current.scrollTop` 重新同步状态（`useLayoutEffect` 预绘制前修正）。
- 下钻路径跨模式保留（切换到全局排行不清空 `drillPath`）。

### 5. 图表高度随行数动态变化 → 显式 `height`

仅靠内容驱动 + `maxHeight` 在某些布局下不会随内容重新撑起/收缩。改为显式 `height: min(MAX_HEIGHT, 行数×32 + HEADER_HEIGHT)`，表头固定 32px，高度随行数确定性变化。

### 6. 外层滚动容器"增长才滚动到底"

图表卡片变高时，外层 `.adl-git-vis__container` 需自动滚动到底部以保证完整可见；但收缩/等高时不得拽动视口。用 `prevViewHeightRef` 记录上一高度，仅当 `current > prev` 时滚动；首次变化只记录基线（不滚动）。外层容器通过 `scrollContainerRef` prop 传入，避免子组件 `closest('.adl-git-vis__container')` 的 DOM 类名耦合。

### 7. 悬停按钮的可点击性与可访问性

`opacity: 0` 的按钮仍会接收指针事件（点击不可见区域误触发）。悬停按钮默认 `pointer-events: none`，悬停/`:focus-visible`/`:focus-within` 时恢复 `pointer-events: auto` + `opacity: 1`，保证键盘可聚焦可见。
