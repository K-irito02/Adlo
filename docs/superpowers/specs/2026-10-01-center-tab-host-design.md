# 中心标签宿主改造设计（中心多标签 + 浏览器双宿主 + dsh 统一）

- 日期：2026-10-01
- 状态：待用户复审
- 影响工作区：`ai-digital-life/`

## 1. 背景与目标

当前「中心」（`CenterPane`）是**单一宿主**：dsh 打开时渲染 `DshHostRegion`（Tauri 下为专属原生 WebView2 子窗口），dsh 关闭时渲染 `WelcomePage`（dsh 打开 + 版本管理）。浏览器标签、终端标签都只能存在于右侧面板。

本设计将中心改造为**多标签宿主**，让浏览器 WebView 与终端视图可以在「右侧面板 ↔ 中心」之间双向转移，并在标题栏以标签条形式统一呈现。

### 目标

1. 浏览器面板的书签标签、已打开标签、欢迎页快捷站点/端口，提供「在中心显示」入口。
2. 终端面板的终端标签提供「在中心显示」入口（右键菜单）。
3. 标题栏显示中心标签条，可切换、关闭、移回对应面板；支持固定区域的溢出横向滚动与「新建空标签页」按钮。
4. 中心新增三入口引导页（打开 dsh / 打开浏览器欢迎页 / 打开终端欢迎页）。
5. 转入中心的标签不在对应面板重复显示；面板的「关闭/清空/删除」不影响已转入中心的标签。
6. dsh 统一为普通浏览器 WebView 标签，面板↔中心为同一原生 WebView 的纯位置移动。

### 非目标

- 不做中心标签的拖拽排序 / 固定（Pin）（本期不做，标签按打开顺序排列）。
- 不改变右侧面板既有导航树、工具栏、终端目录导航的既有行为，仅新增入口与过滤。
- 不引入分阶段兼容层或旧数据迁移代码（未发布阶段规则）。

## 2. 术语

- **中心标签（CenterTab）**：标题栏中显示、在中心承载的标签。
- **位置（location）**：浏览器/终端标签所属宿主，`'panel'`（右侧面板）或 `'center'`（中心），排他。
- **launcher**：三入口引导页中心标签。
- **双宿主管理器**：支持「右侧面板 + 中心」两个宿主各自驱动一个活动浏览器 WebView 的前端机制。

## 3. 总体架构

```
TitleBar（标签条 + 新建标签按钮）
   │  订阅 centerTabs / centerActiveTabId
   ▼
CenterPane（视图调度器）
   ├── launcher      → CenterLauncherPage（三入口 + dsh 版本管理卡片）
   ├── browser       → CenterBrowserView（完整工具栏 + 内容区）
   └── terminal      → CenterTerminalView（工具栏子集 + 内容区）
                                   │
右侧面板                            │ 共享
   ├── BrowserPanel ──┐            │
   └── TerminalPanel ─┴────────────┘
                      共享 WebView 池 + 双宿主 bounds 驱动
```

核心机制：

1. **共享 WebView 池单例**：浏览器 WebView 池成员、创建守卫、版本号提升为模块级单例，供面板与中心两个宿主共享，消除重复创建竞态。
2. **per-host 驱动**：`useBrowserViewHost({ host, activeTab, isVisible, overlayActive })` 为每个宿主独立维护「活动标签 / 隐藏上一个 / 可见性」，两个宿主可同时各显示一个浏览器 WebView。
3. **位置排他**：一个浏览器/终端标签的 `location` 唯一，任一标签只会被一个宿主定位，不会互抢。

## 4. 数据模型（store）

### 4.1 新增 `centerTabsSlice`

```ts
type CenterTabKind = 'launcher' | 'browser' | 'terminal';

interface CenterTabState {
  id: string;              // createUiId('center')
  kind: CenterTabKind;
  refId: string | null;    // browser: browserTabs.id；terminal: terminalTabs.id 或 null（选择器）；launcher: null
  createdAt: number;
}

centerTabs: CenterTabState[];   // 标题栏顺序
centerActiveTabId: string;
```

- browser/terminal 中心标签的标题、图标**实时从** `browserTabsById` / `terminalTabsById` 读取，不在中心 store 复制。
- launcher 标签：显示 `CenterLauncherPage`。
- terminal 中心标签 `refId === null`：显示终端选择器（工作区绑定 + 终端类型）。

### 4.2 既有标签新增字段

```ts
// BrowserTabState
location?: 'panel' | 'center';   // 缺省 'panel'
isDsh?: boolean;                 // dsh 承载标签（见 §11）

// TerminalTabState
location?: 'panel' | 'center';   // 缺省 'panel'
```

### 4.3 切片动作

新增 `centerTabsSlice` 动作：

- `centerOpenLauncherTab()`：新建 launcher 标签并激活。
- `centerOpenBrowserTab(browserTabId)`：将浏览器标签移到中心（设 `location='center'`、追加中心标签、激活）。
- `centerOpenTerminalTab(terminalTabId)`：同上（终端）。
- `centerOpenTerminalChooser()`：新建 `kind='terminal', refId=null` 的中心标签（终端欢迎/选择器）。
- `centerSelectTab(centerTabId)`。
- `centerCloseTab(centerTabId)`：真关闭（见 §5）。
- `centerMoveToPanel(centerTabId)`：移回对应面板（见 §5）。
- 活动标签重夹（见 §5）。

浏览器/终端切片新增：

- `browserSetLocation(tabId, location)` / `terminalSetLocation(tabId, location)`：仅写字段与持久化。
- 移动编排（同时改 location + centerTabs + 重夹活动标签）收敛在一个跨切片 action 模块，避免两个切片互相 import。

## 5. 移动语义与生命周期

| 操作 | 语义 |
|---|---|
| 在中心显示（已打开标签） | 移动：`location='center'`，追加中心标签，激活之；若它是面板活动标签，重夹面板活动标签到最后一个 `panel` 标签 |
| 在中心显示（书签/历史/快捷站点/端口，非已打开标签） | 新建：以该 URL/title 新建一个 `location='center'` 的浏览器标签 |
| 在浏览器/终端面板显示（标题栏悬停） | 移动：`location='panel'`，移除中心标签，激活对应面板标签 |
| 关闭（标题栏悬停） | 真关闭：走既有完整关闭路径（浏览器 `browserCloseTab` + `removeSiteMetaIfUnreferenced`；终端杀 PTY、释放 xterm 池、删历史），并移除中心标签 |
| 关闭最后一个中心标签 | 自动新建一个 launcher 标签 |

**面板破坏性操作的位置过滤**（核心约束）：

- `browserCloseAllTabs(workspaceId?)`（全局与按工作区）、`terminalCloseAllTabs(workspaceId?)`、浏览器树/终端的「删除该目录下全部标签 / 清空全部 / 移除工作区」等，**均只作用于 `location==='panel'` 的标签**。
- 中心标签只能通过标题栏关闭，或移回面板后再关闭。
- 关闭 dsh 标签时额外停止 dsh 进程（见 §11）。

## 6. 浏览器双宿主 WebView 管理器

### 6.1 现状问题

`useBrowserWebView` 内部 `useBrowserPool` 用组件内 `useRef` 持有池成员；`useWebViewLifecycle` 用单个 `prevActiveTabIdRef` 维护「当前活动标签」。若直接实例化两份，两宿主各持一份互不可见的池，且互相把对方的 WebView 移出画面。

### 6.2 改造方案（Rust 侧不变）

1. **抽取共享 WebView 池为模块级单例**：`Set<tabId>` + `creating` 守卫 + `poolVersion`（可用轻量 Zustand store 承载）。`createTabWebView / activateTab / navigateTab / destroyTab` 收敛到单例。Rust `BrowserPool` 本就全局、按 tabId 寻址，前端共享后即消除重复创建。
2. **`useBrowserViewHost({ hostId, activeTab, isVisible, overlayActive })`**：组合 bounds / lifecycle / visibility，所有「活动标签 / 隐藏上一个 / 可见性」ref 均 per-host。
3. **参数化 `useWebViewBounds`**：去掉对 `.adl-rightpanel__content` 的硬编码，改为传入所属宿主的容器/内容元素。
4. **复用 `BrowserToolbar` / `BrowserContentArea` / `BrowserIframeStack`**：参数化后供面板与中心共用；面板专属导航树、关闭全部不进入中心。
5. **卸载/切走隐藏**：中心宿主仅在「当前中心标签 = browser」时挂载；切走或卸载时隐藏该宿主 WebView（补 `unmount` 隐藏清理）。
6. **`useBrowserSuspendScheduler` 保护两宿主活动标签**，并保护 dsh 标签不被挂起回收。
7. **全局浮层隐藏信号**：对话框/菜单（body 级浮层）出现时，两个宿主都隐藏 WebView；把 overlay 检测提升为共享信号。
8. **z-order**：任一宿主创建 WebView 时 bump `siblingWebviewNonce`（沿用现有机制）。

### 6.3 端差异

- Tauri：两宿主各驱动一个原生 WebView2（按 tabId 独立 bounds）。
- 浏览器模式：两宿主各渲染一个 `BrowserIframeStack`（沿用 `activatedTabIdsRef` 多 iframe 保状态）。
- 用户可感知行为一致。

## 7. 中心视图渲染

`CenterPane` 重写为视图调度器：订阅 `centerTabs` + `centerActiveTabId`，只渲染**当前活动中心标签**；`CloseDshDialog` 退役（见 §11）。

### 7.1 `CenterLauncherPage`

- 三入口「打开 dsh / 打开浏览器欢迎页 / 打开终端欢迎页」，点击**就地转换**当前 launcher 标签（不新增标签）。
- 打开 dsh：调用既有 `openDsh()` 拉起进程 → 以返回 URL 新建 `browser` 中心标签（`isDsh=true`）。
- 打开浏览器欢迎页：新建一个空 URL 的 `browser` 中心标签（内容区渲染 Landing）。
- 打开终端欢迎页：将当前标签转为 `kind='terminal', refId=null`（显示终端选择器）。
- **保留 dsh 版本管理卡片**（当前版本/最新版本/检查更新/升级/卸载/重装），位置在入口下方。

### 7.2 `CenterBrowserView`

- 工具栏**完全复用**右侧面板浏览器工具栏：前进 / 后退 / 刷新 / 地址栏（含复制链接、收藏标签）/ 搜索引擎设置 / 下载 / 更多操作。
- 因地址栏已具备，**不再**额外添加「网址或内容的搜索输入框」。
- 内容区：Tauri 走中心宿主；浏览器模式走 `BrowserIframeStack`。
- 空 URL：渲染 Landing（快捷站点 / 本地端口）；点击快捷站点/端口/地址栏回车 → **在中心新建一个中心浏览器标签并加载**。

### 7.3 `CenterTerminalView`

- 顶部工具栏**只含**「单双列 / 区域交换 / 菜单」，不含新建终端复合按钮与左侧目录导航。
- 内容区复用只读历史区 + 分割线 + 实时 `XtermTerminal`，含区域折叠、删除历史等既有行为。
- 终端选择器（`refId=null`）：复刻 `TerminalShellSelector` 复合菜单（profile 列表 + 工作区子菜单）；未绑定工作区默认 `__independent__`（默认终端目录）。选定后 `terminalCreateTab(profile, workspaceId)` 并以 `location='center'` 创建，回填 `refId`。

### 7.4 复用与抽取

- 抽取不依赖「面板导航/全局关闭」的 `useTerminalView(tab)`，供右面板与中心共用（任一 session 只在一处挂载 xterm）。
- 参数化 `BrowserToolbar` / `BrowserContentArea` / `BrowserShell`。

## 8. 标题栏标签条

### 8.1 展示

- 位置：标题栏中部固定宽度区间；单行、不换行。
- 每个标签：kind 图标（launcher / 浏览器 favicon / 终端 profile 图标）+ 标题 + 活动态；browser/terminal 标题实时取自底层 store。

### 8.2 交互

- 点击标签：切换 `centerActiveTabId`。
- 悬停显示两个按钮：①「关闭」（真关闭）；②「在浏览器面板显示」/「在终端面板显示」（仅 browser/terminal kind 有）。
- launcher 标签只显示「关闭」。
- 溢出：超出固定区间的标签隐藏；鼠标悬停在标签条上时滚轮（垂直）映射为**横向滚动**。

### 8.3 拖拽区域规则

- 标签条容器保留 `data-tauri-drag-region`；标签按钮**不加**该属性。
- 结果：标签实际占据处点击不拖拽（命中按钮）；标签之间/标签条内的空白、以及标题栏其余空白仍可拖拽窗口。
- 实现依赖 Tauri 对子元素 drag-region 的处理，列入验证清单。

### 8.4 「新建空标签页」按钮

- 固定在标签条区域右端（不随标签滚动）。
- 点击：新建 `launcher` 标签并激活。

## 9. 右侧面板入口

### 9.1 浏览器面板

1. **工作区目录 / 非工作区目录 / 历史目录的书签标签**
   - 「更多操作」菜单卡片（`BrowserTreeEntryMenu` 的 `entryMenuItems`）与右键菜单卡片（`browser-tab-context-menu`）。
   - 新增「在中心显示」；语义：新建中心浏览器标签（`browserOpenTab(url, title, ws)` 且 `location='center'`）。
2. **「已打开标签页」列表**（`BrowserOpenTabFlatListItem`）
   - 新增右键菜单卡片，含「在中心显示」；语义：移动。
   - 悬停关闭按钮已存在，保留。
3. **空标签欢迎引导页**的快捷站点 / 本地端口
   - 右键菜单卡片新增「在中心显示」；语义：新建中心浏览器标签。

### 9.2 终端面板

1. **默认终端目录 / 工作区目录下的终端标签**（`WorkspaceTerminalEntry` → `TerminalTabBar`）
   - 接上右键菜单卡片（当前 `onContextMenu` 为空实现），新增「在中心显示」；语义：移动。
   - 悬停关闭按钮维持现状（已是悬停出现）。
2. 各「清空/删除」类按钮跳过中心标签（§5）。

## 10. dsh 统一为普通浏览器标签

### 10.1 做法

- **退役 dsh 专属窗口这条线**：`browser_create_dsh_view` / `browser_destroy_dsh_view` / `browser_set_dsh_bounds`、`DshHostRegion` 原生分支、`useDshWebViewBounds` / `useDshWebViewVisibility`。
- dsh 进程生命周期不变：`dsh.open()` 仍拉起进程并返回 URL。
- 前端以普通浏览器标签机制（`browser_create_for_tab`，注册进 `BrowserManager`）创建 `location='center'` 的浏览器标签，并标 `isDsh=true`。
- 面板↔中心 = 纯位置移动，**同一个原生 WebView 被重新定位**，真正复用；dsh 标签天然拥有浏览器工具栏、favicon/标题与移回面板入口。

### 10.2 关闭语义

- 关闭 dsh 标签（标题栏 / 面板 / 清空）= 销毁该标签 **并直接彻底退出 dsh 进程**（`dsh.close(false)`）。
- `CloseDshDialog`（保留进程 / 彻底退出）退役。
- dsh 标签不跨重启持久化（进程不存活，hydrate 时 prune）。

### 10.3 版本管理归属

- dsh 版本管理卡片移到 launcher 引导页（§7.1）。

## 11. 持久化

- 新增登记项：`center.tabs`（对象数组，校验 `kind` / `refId` / `createdAt`）、`center.activeTabId`（字符串）。
- `adl:browser.tabs` parser 增加 `location` 枚举（缺省回退 `'panel'`）与 `isDsh` 布尔（dsh 标签不入持久化）。
- `adl:terminal.tabs` parser 增加 `location` 枚举（缺省回退 `'panel'`）。
- hydrate 后处理：丢弃 `refId` 悬空的中心标签（复用既有 prune 串接）；若中心标签为空则新建一个 launcher。
- 位置与中心标签顺序跨重启恢复（用户已确认）。

## 12. i18n

新增 key（zh-CN + en-US 双份，无硬编码）：`centerTabShowInCenter`（在中心显示）、`centerTabShowInBrowserPanel`、`centerTabShowInTerminalPanel`、`centerNewTab`（新建标签页）、终端选择器/入口相关文案等。

## 13. 边界与错误处理

- 中心标签 `refId` 悬空 → hydrate prune；为空 → 自动 launcher。
- 移动后重新夹取面板/中心活动标签，避免指向已移走标签。
- 面板↔中心往返时 WebView 状态保持（Tauri 按 tabId 复用原生 WebView；浏览器模式复用 iframe 栈）。
- 全局浮层出现 → 两宿主同时隐藏 WebView。
- 窗口 640px 最小宽下标签条布局；语言切换时标签标题实时跟随。
- 中心浏览器 WebView 创建失败 / CSP 拦截 → 沿用现有外部打开兜底。
- 中心终端 shell 缺失 → 沿用现有「终端未找到」提示。
- dsh 未安装点「打开 dsh」→ 走现有错误卡片/提示。

## 14. 测试计划（红绿测试，先失败后实现）

- **单元**：`centerTabsSlice`（增删/移动/活动标签重夹/prune/自动 launcher）、`location` 过滤（各「关闭全部/清空/删除」跳过中心标签）、持久化 parser（`location` 枚举 + `center.tabs`）、dsh 关闭联动停进程。
- **组件**：`TitleBar` 标签条（渲染/切换/悬停按钮/`+`/溢出滚动）、`CenterLauncherPage` 就地转换、`CenterBrowserView` / `CenterTerminalView`、各面板入口菜单项存在。
- **双端集成**：Tauri 实测双 WebView 同屏 bounds/z-order/overlay 隐藏；浏览器模式双 iframe 栈。
- 质量门：`cargo clippy --workspace --all-targets -- -D warnings`、`pnpm --dir frontend run lint`、前端 `tsc --noEmit`。

## 15. 风险与验证清单

- 两个原生 WebView2 同屏的 z-order，以及与 dsh↔浏览器「分隔线透明桥接条（`divider_strip_*`）」的相互影响。
- Rust `browser_set_tab_bounds` 允许两个 tab 同时处于非离屏坐标（预期可行，按 tabId 独立寻址）。
- 中心浏览器 WebView 与右侧面板浏览器 WebView 相邻时是否互相遮挡。
- 面板 WebView 管理重构（共享池单例 + per-host 驱动）的回归风险。
- Tauri `data-tauri-drag-region` 对子元素（标签按钮）的处理是否满足「标签处不可拖、空白处可拖」。

## 16. 改动清单（主要文件）

**Rust**
- `src-tauri/src/commands/browser.rs`：退役 dsh 专属视图命令（`browser_create_dsh_view` / `browser_destroy_dsh_view` / `browser_set_dsh_bounds`、`DSH_VIEW_LABEL`、`destroy_dsh_webview`）。
- `src-tauri/src/main.rs`：反注册上述命令。
- `src-tauri/src/commands/divider_strip.rs`：随 dsh 视图退役评估桥接条调整。

**前端 store**
- 新增 `stores/slices/centerTabsSlice.ts`、`stores/slices/centerTypes.ts`；登记进 `StoreState` / `slicedStore`。
- `stores/slices/browserTypes.ts` / `browserTabsSlice.ts`：`location`、`isDsh`、按位置过滤与关闭过滤、`browserSetLocation`。
- `stores/slices/terminalSliceTypes.ts` / `terminalSlice.ts`：`location`、`terminalSetLocation`、关闭过滤。
- `stores/persisted/registry.ts` / `parsers.ts` / `prune.ts`：新增 `center.*`、`location`、`isDsh`。
- 新增中心 action 编排模块；`stores/actions/dshActions.ts`：dsh 关闭联动。

**前端 region/feature**
- `regions/CenterPane.tsx`：视图调度器重写。
- `regions/TitleBar.tsx`：标签条 + 新建标签按钮。
- `features/center/`（新增）：`CenterLauncherPage` / `CenterBrowserView` / `CenterTerminalView` / `useBrowserViewHost` / 共享 WebView 池单例。
- `features/browser/`：`useBrowserWebView` / `useWebViewBounds` / `useBrowserPool` / `useWebViewLifecycle` / `useBrowserSuspendScheduler` / `BrowserToolbar` / `BrowserContentArea` / `BrowserShell` / `useBrowserMenus` / `BrowserContextMenu` / `BrowserOpenTabFlatListItem` / `BrowserTabTree`（入口）。
- `features/terminal/`：`TerminalTabBar` / `useTerminalContextMenu` / `TerminalContextMenu` / 抽 `useTerminalView`。
- `features/workspace-terminal/WorkspaceTerminalEntry.tsx`：接右键菜单。
- `features/browser/browser-landing/BrowserLandingPage.tsx`：快捷站点/端口右键入口。
- `features/dsh/`：`DshHostRegion` / `WelcomePage` / `useDshWebViewBounds` / `useDshWebViewVisibility` / `CloseDshDialog` 退役或改造。

**i18n**
- `i18n/zh-CN/*`、`i18n/en-US/*`：新增 key。

## 17. 未决问题

无（关键决策已在头脑风暴阶段确认）。
