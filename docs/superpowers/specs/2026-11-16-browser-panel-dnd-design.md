# 浏览器面板拖拽 · 设计规格

> 日期：2026-11-16　｜　状态：已实现（交互采用 D 的分区；落点反馈 B2；抬起副本 B 纸张）　｜　工作树：slot-1

## 1. 目标

- 右侧面板「书签目录」下，书签文件夹与书签条目支持鼠标拖拽：改变父子关系、改变同级顺序、跨工作区/自建目录移动；「书签列表」只支持书签行排序与顶层文件夹/工作区行，嵌套文件夹分隔符既不可拖也不可放入。
- 「工作区目录」分类的**工作区根节点**不可拖拽，但可作为放置目标；不可变成新顶级目录。
- 「自建目录」分类标题行/空白区可作为新顶级目录的投放区；书签不能变成顶级目录。
- 「历史目录」完全只读。
- 「已打开标签页」平铺列表支持排序；pinned 标签保持前置分组，只在组内排序。
- 书签目录/书签列表不再展示活标签；活标签只出现在「已打开标签页」。
- 书签行与活标签彻底解耦：只显示书签自身标题/URL，不显示音量图标、不跟随活标签标题。
- 顺序模型为未来智能体整理预留稳定 key 与纯函数 mutation 层；MCP 接入不在本轮实现。

## 2. 非目标

- 不做多选拖拽、撤销/重做、键盘排序。
- 不把已打开标签拖进书签目录。
- 不改变历史目录内部的展示与删除行为。
- 不新增“悬停自动展开”生产设置；原型里的开关只用于评估。折叠目录被放入时保持折叠。
- 不新增 IPC / Rust 后端改动。

## 3. 术语

- **容器 (Container)**：一个可拥有子项的位置。key：`custom:root`（自建目录顶级）、`workspace:<id>`（工作区根节点）、`folder:<id>`（书签文件夹）。
- **子项 key**：`folder:<folderId>` / `entry:<entryId>`。
- **顺序表 (Order Table)**：`browserBookmarkChildOrder: Record<containerKey, itemKey[]>`；只表达顺序，内容仍由 folders / entries 数组持有。
- **放入 (Drop Into)**：改变父子关系。
- **排序插入 (Reorder Insert)**：不改变父子关系，只改同级顺序。
- **幽灵占位**：排序插入时显示半透明占位行；放入时显示虚线幽灵子行。

## 4. 已定规则

### 4.1 跨分类矩阵

| 被拖拽物 | 放到文件夹 | 放到工作区根节点 | 放到自建目录标题行/空白区 | 放到工作区标题行 | 放到历史分类 |
| --- | --- | --- | --- | --- | --- |
| 书签文件夹 | 放入（含跨分类） | 放入（可换工作区） | 变成顶级书签文件夹 | 禁止 | 禁止 |
| 书签条目 | 放入 | 放入 | 禁止 | 禁止 | 禁止 |
| 工作区根节点 | 不可拖 | 不可拖 | 不可拖 | 不可拖 | 不可拖 |

- 移动文件夹时整棵子树一起移动。
- 禁止把文件夹放进自己或自己的后代。
- 放入位置 = 目标容器混合列表末尾；非法/取消 = 状态不变。
- 书签同 `(url,title)` 冲突：拒绝移动（沿用现有 `checkBookmarkCollision` 语义）。

### 4.2 顺序与默认值

- 同一容器内书签与文件夹**混合排序**。
- 没有顺序表的容器：**目录在前、书签在后**；各自沿用原数组顺序。
- 顺序表里不存在的子项：按默认顺序追加到末尾；已失效 key 忽略。
- 跨容器移动：从源顺序表移除，插入目标顺序表；源容器顺序表收敛为当前剩余子项 key。
- `custom:root` 顺序表控制顶级自建文件夹顺序；工作区根节点顺序固定为由 `recentWorkspaces` 决定，不允许排序。

### 4.3 交互（方案 D）

- 目录/文件夹行：
  - 上 20%：排序插入到该行之前；
  - 下 20%：排序插入到该行之后；
  - 中间 60%：放入该文件夹。
- 书签行：上/下 50% 排序插入；书签不能承接“放入”。
- 工作区根节点整行：放入该工作区；不允许排序插入。
- 排序插入：显示 2px 两端渐隐插入线 + 柔光；不使用幽灵占位行。
- 放入：目标行中性淡色背景（暗色白 / 亮色黑），无描边、无外发光。
- 自建目录标题行/空白区：拖动文件夹时高亮为“变成顶级目录”；书签/工作区分类/历史分类为禁止态。
- 非法拖拽：只显示禁止光标；松手状态不变，不弹 toast。
- 折叠目录：放入后保持折叠；不自动展开。

### 4.4 已打开标签页

- 只重排面板标签（`location !== 'center'`）；中心标签位置不受影响。
- pinned 固定在前的分组；pinned 只能落在 pinned 组（含组尾边界），普通标签只能落在普通组（含组首边界）；跨组禁止。
- 排序结果写回 `sortOrder` 并持久化。

## 5. 数据模型与接口

### 5.1 新增状态

```ts
browserBookmarkChildOrder: Record<string, string[]>;
```

持久化 key：`adl:browser.bookmarkChildOrder`，读取器 `readStringArrayRecord`，scope `global`。

### 5.2 纯函数模型

文件：`frontend/src/app/stores/slices/browserBookmarkOrder.ts`

```ts
export const CUSTOM_ROOT = 'custom:root';
export function folderContainerKey(id: string): string;
export function workspaceContainerKey(id: string): string;
export function folderItemKey(id: string): string;
export function entryItemKey(id: string): string;

export interface BookmarkMoveState {
  browserBookmarkFolders: BookmarkFolder[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  browserBookmarkChildOrder: Record<string, string[]>;
  /** 已知工作区 id；提供时校验 workspace 目标存在，未提供则按宽松模式跳过。 */
  workspaceIds?: readonly string[];
}

export type BookmarkMove =
  | {
      kind: 'folder';
      id: string;
      target:
        | { kind: 'into'; container: string }
        | { kind: 'insert'; container: string; index: number }
        | { kind: 'new-root' };
    }
  | {
      kind: 'bookmark';
      id: string;
      target:
        | { kind: 'into'; container: string }
        | { kind: 'insert'; container: string; index: number };
    };

export type BookmarkMoveError =
  | 'folder-not-found'
  | 'bookmark-not-found'
  | 'target-missing'
  | 'folder-into-self'
  | 'folder-into-descendant'
  | 'bookmark-to-custom-root'
  | 'bookmark-duplicate';

export function resolveContainerChildren(
  state: Pick<BookmarkMoveState, 'browserBookmarkFolders' | 'browserWorkspaceBookmarks' | 'browserBookmarkChildOrder'>,
  container: string,
): Array<
  | { kind: 'folder'; id: string; key: string; name: string }
  | { kind: 'entry'; id: string; key: string; name: string; url: string }
>;

export function applyBookmarkMove(
  state: BookmarkMoveState,
  move: BookmarkMove,
): { ok: true; state: BookmarkMoveState } | { ok: false; error: BookmarkMoveError };
```

- `applyBookmarkMove` 只做数据变换，不读 store、不弹 toast。
- Store action `browserMoveBookmarkNode(move)` 调用它，成功后 persist 三份状态并返回 `{ ok, error? }`。
- 未来 MCP 可直接复用 `applyBookmarkMove` + `resolveContainerChildren`，无需理解 UI。

### 5.3 Store action

`browserFoldersSlice.ts` 新增：

```ts
browserBookmarkChildOrder: Record<string, string[]>;
browserMoveBookmarkNode: (move: BookmarkMove) =>
  | { ok: true }
  | { ok: false; error: BookmarkMoveError };
```

成功后 `persist('adl:browser.bookmarkFolders', ...)`、`persist('adl:browser.workspaceBookmarks', ...)`、`persist('adl:browser.bookmarkChildOrder', ...)`。

### 5.4 树构建

- `buildFolderNode` / `buildWorkspaceCategoryTree` / `buildUserFolderCategoryTree` 接收 `browserBookmarkChildOrder`，按 `resolveContainerChildren` 的顺序生成混合 children。
- `buildWorkspaceCategoryTree` **删除活标签注入**（`tabNodes`），删除 bookmark 的活标签查找与音频状态；书签只用自己的快照标题/URL。
- `buildFolderNode` 同样删除活标签查找与音频状态。
- `buildHistoryCategoryTree` 保持现状（历史行仍可按当前行为显示音频状态）。
- 工作区根节点即使没有书签/目录也保留；空态显示现有空目录提示。

### 5.5 UI 接线

- `BrowserNavigator` → `BrowserNavTabsMode` / `BrowserNavListMode` → `BrowserTabTree` 增加 `browserBookmarkChildOrder` prop。
- `BrowserTabTree` 用 `useBrowserTreeDnd` 处理拖拽：
  - 顶层 `BrowserTreeEntry` 根节点带 `data-path`；子行 `TreeRow` 已有 `data-path`。
  - 事件委托到树容器，按 `data-path` 查节点信息；构建 `Map<path, { kind, container, index, folderId/workspaceId }>`。
  - **使用 Pointer Events（pointerdown/move/up + `document.elementFromPoint`），不使用 HTML5 Drag & Drop**：Tauri 2 在 Windows 默认 `dragDropEnabled: true` 会拦截 DOM 拖拽事件；改用 pointer 事件可同时保留“文件/文件夹拖入应用打开工作区”的原生能力。
  - 投放指示器用 portal 到 `document.body` 的 fixed overlay（插入线/行高亮），避免被面板 transform 包含块偏移；点击抑制只保留 document 捕获层。
  - `pointerup` 调 `browserMoveBookmarkNode`；非法时只显示禁止光标，不弹 toast。
- `BrowserOpenTabFlatList` 增加拖拽排序：
  - Pointer Events（`onPointerDown` + window `pointermove/up`），不使用 HTML5 DnD；
  - 插入线 portal 到 `document.body` 的 fixed 元素（z-index 高于 ghost），不参与列表 flex 布局；
  - 重排结果合并回全量 `browserTabs` 后调 `browserReorderTabs`，保留中心标签。

## 6. i18n

只新增 `browserPinnedGroupLabel`（固定标签分组标题）到 `zh-CN/browser.ts` / `en-US/browser.ts`。

非法拖拽不弹 toast，因此不需要 `browserDnd*` 文案；拖拽状态由光标与视觉指示表达。

## 7. 测试

- `browserBookmarkOrder.test.ts`：默认目录在前、混合顺序、跨容器移动、new-root、非法后代、书签不能到根部、顺序表收敛。
- `browserFoldersSlice.test.ts`：action 成功后三份状态持久化；失败不改状态。
- `browserPanelPersistence.test.ts`：`adl:browser.bookmarkChildOrder` 读取/回退。
- `useBrowserTreeData` / `browserTreeCounts` 测试更新：工作区根节点不再含活标签；书签无音频；顺序表生效。
- `useOpenTabReorder.test.ts`：普通组重排、pinned 边界、跨组拒绝、中心标签保留。
- `BrowserOpenTabFlatList.test.tsx`：portal 插入线、ghost/body/click 清理、4px 阈值与上下半区。
- `BrowserTabTree` DnD 交互测试：放入、插入、非法恢复、分类标题行、折叠保持。
- 最终 `pnpm --dir adlo/frontend run check:changed` + 受影响 Rust 无改动（跳过）。

## 8. 双端与兼容

- 纯前端状态/交互，双端行为一致；无 IPC/Rust 改动。
- 不新增实体字段，无迁移脚本；旧数据无顺序表时按目录在前渲染。
- 顺序表按稳定 id 记录；删除/失效 key 忽略，不阻塞读取。

## 9. 后续（不在本轮）

- 书签真源迁到 Rust 后端 + MCP 工具（`bookmarks.get_tree` / `bookmarks.apply_mutations`），复用本轮纯函数 mutation 语义。
