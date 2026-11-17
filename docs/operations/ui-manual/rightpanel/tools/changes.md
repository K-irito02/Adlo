# 变更工具面板

> Git 变更和补丁预览面板。

## 容器选择器

| 选择器                     | 说明                   |
| -------------------------- | ---------------------- |
| `#changes-panel`           | 变更面板容器           |
| `.adl-tool-panel--changes` | 变更工具面板根节点     |
| `.adl-tool-surface--files` | 变更面板的双栏布局容器 |

---

## 变更列表

> Git 变更文件列表

### 定位选择器

| 优先级 | 类型 | 选择器                       |
| ------ | ---- | ---------------------------- |
| 1      | CSS  | `.adl-patch-file-card`       |
| 2      | CSS  | `.adl-patch-file-card__open` |
| 3      | CSS  | `.adl-patch-hunk-card`       |

### 变更项

| 选择器                           | 说明                   |
| -------------------------------- | ---------------------- |
| `.adl-patch-file-card`           | 变更文件卡片           |
| `.adl-patch-file-card.is-active` | 当前选中变更文件       |
| `.adl-patch-file-card__open`     | 打开当前文件到右侧视图 |
| `.adl-patch-hunk-card`           | 单个补丁块             |
| `.adl-patch-hunk-card__toggle`   | 折叠/展开补丁块        |

### 操作

#### 查看变更详情

```javascript
await page.click(".adl-patch-file-card__open");
await page.waitForSelector('div[data-testid="changes-preview-shell"]');
```

---

## 导航模式

> 变更面板左侧支持 `文件树` / `文件列表` / `文档大纲` 三种导航模式。

### 文件树

| 选择器                                 | 说明                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `.adl-filetree-shell`                  | 共享自绘滚动壳                                                                 |
| `.adl-filetree-scroll`                 | 文件树滚动容器                                                                 |
| `.adl-filetree__item`                  | 文件 / 文件夹节点                                                              |
| `.adl-filetree__row`                   | 整行交互区域                                                                   |
| `.adl-filetree__label`                 | 文件 / 文件夹名称按钮                                                          |
| `.adl-filetree__toggle`                | 文件夹收起 / 展开按钮                                                          |
| `.adl-filetree__item.is-active`        | 当前点击选中节点                                                               |
| `.adl-filetree__item.is-selected`      | 强选中（用户点击节点，蓝底 `--bg-active` + 左侧强调条）                        |
| `.adl-filetree__item.is-weak-selected` | 弱选中（编辑器当前打开的文件，淡蓝底 + 左侧强调条，`!important` 优先于强选中） |
| `.adl-filetree__meta`                  | 元数据容器（变更字母类型）                                                     |
| `.adl-filetree__count`                 | 统计数字容器                                                                   |
| `.adl-filetree__status-badge`          | 变更字母类型 badge（A/D/M）                                                    |
| `.adl-filetree__count-badge`           | 统计数字 badge                                                                 |
| `.adl-multitree-entry__count`          | 顶级目录变更统计数字                                                           |

### 文件行右侧元素结构

```text
.adl-filetree__row
├── .adl-filetree__label (文件名)
├── .adl-filetree__meta
│   └── .adl-filetree__status-badge (变更类型: A/D/M)
└── .adl-filetree__count
    └── .adl-filetree__count-badge (统计数字)
```

### 样式约定

- `.adl-filetree__row` 的 `padding-inline-end` 控制右侧边距
- `.adl-filetree__meta` 与 `.adl-filetree__count` 之间通过 `gap: 2px` 控制间距
- 顶级目录使用 `.adl-multitree-entry__count`，与文件行的变更统计共用同一右侧边距基准

### 文件列表

> 文件列表模式以平铺方式展示所有变更文件（无目录层级），与文件树模式共用同一套 `.adl-filetree` 文件树组件，通过 `flat` prop 移除缩进占位符以获得更紧凑的显示。

| 选择器                          | 说明                           |
| ------------------------------- | ------------------------------ |
| `.adl-filetree-shell`           | 共享自绘滚动壳                 |
| `.adl-filetree-scroll`          | 文件列表滚动容器               |
| `.adl-filetree__item`           | 文件节点                       |
| `.adl-filetree__row`            | 整行交互区域（无左侧额外缩进） |
| `.adl-filetree__label`          | 文件名称按钮                   |
| `.adl-filetree__item.is-active` | 当前点击选中节点               |

### 行为约定

1. 文件树与文档大纲样式独立维护：文件树开关按钮 16×16，大纲树 20×20；连接竖线位置不同（文件树 baseline `left:18px` + `var(--adl-tree-indent)` 每层 +14px，大纲树固定 `left:13px`）。
2. 文件树与文档大纲共用同一套树节点行交互规则：hover 时仅标签区域高亮，active 时整行和 toggle 一起进入选中态。
3. 文件列表模式只显示文件名，不显示完整路径；超长名称使用单行截断省略。
4. 文件列表模式无目录层级，所有节点为同一缩进级别，无展开/折叠操作。
5. 文件树与文档大纲共用 `CustomScrollArea` 自绘滚动壳，滚动条 hover / active 视觉保持一致。

---

## 摘要统计与状态筛选

> 变更导航器顶部显示 `已暂存` / `已修改` / `未跟踪` 三个统计卡片，展示所有可见工作区中各状态的合计文件计数，同时支持点击筛选。

### 定位选择器

| 优先级 | 类型       | 选择器                                        |
| ------ | ---------- | --------------------------------------------- |
| 1      | aria-label | `button[aria-label="已暂存"]`                 |
| 2      | aria-label | `button[aria-label="已修改"]`                 |
| 3      | aria-label | `button[aria-label="未跟踪"]`                 |
| 4      | CSS        | `.adl-tool-navigator__summary`                |
| 5      | CSS        | `.adl-tool-navigator__summary-stat`           |
| 6      | CSS        | `.adl-tool-navigator__summary-stat.is-active` |

### 容器结构

```text
┌───────────────────────────────────────────┐
│  .adl-tool-navigator__summary             │
│  ┌─────────────────────────────────────┐  │
│  │ .adl-tool-navigator__summary-stats  │  │
│  │ ┌────────┐┌────────┐┌──────────┐   │  │
│  │ │ 已暂存  ││ 已修改  ││ 未跟踪    │   │  │
│  │ │  S:0   ││  M:8   ││  U:0     │   │  │
│  │ └────────┘└────────┘└──────────┘   │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

### 前置条件

- [x] 选择"变更"工具面板（`#changes-panel`）
- [x] 导航器模式为"文件树"或"文件列表"（大纲模式下不显示）

> 注意：即使没有变更文件，状态筛选按钮区域也会常驻显示，方便用户刷新或切换筛选状态。

### 操作

#### 筛选已暂存文件

```javascript
await page.click('button[aria-label="已暂存"]');
await page.waitForSelector('button[aria-label="已暂存"].is-active');
```

#### 筛选已修改文件

```javascript
await page.click('button[aria-label="已修改"]');
await page.waitForSelector('button[aria-label="已修改"].is-active');
```

#### 筛选未跟踪文件

```javascript
await page.click('button[aria-label="未跟踪"]');
await page.waitForSelector('button[aria-label="未跟踪"].is-active');
```

---

## 右键菜单

> 变更面板的文件树/文件列表与文件面板共享同一套右键菜单实现。所有选择器和操作与 [文件面板右键菜单](./files.md#右键菜单) 一致，差异是变更面板中：
>
> - **目录节点同样出菜单**（与文件节点一致），并提供变更语境的 Git 项（整目录 暂存/取消暂存/放弃更改）
> - **已删除文件**：在文件管理器中显示、重命名、删除操作不可用（disabled）
> - **不提供"打开方式"项**（该功能已移除）
> - 复制完整/相对路径始终可用

### 操作

#### 右键打开变更文件菜单

```javascript
await page.locator(".adl-filetree__label").first().click({ button: "right" });
await page.waitForSelector(".adl-sidebar-menu");
```

### 行为约定

1. 右键菜单高亮（`.is-context-menu-target`）在菜单关闭时立即消失（无子对话框操作）或子对话框关闭时消失（重命名/删除）。
2. 粘贴操作自动处理目标路径冲突（`-copy1`、`-copy2`...后缀）。
3. 剪切+粘贴时无论源与目标是否同目录，均使用 duplicate+delete 方式操作（避免 rename 跨文件系统的限制）。
4. 删除操作通过 `trash` crate（Tauri）或 PowerShell（浏览器）移至系统回收站，非永久删除。
5. **目录级"放弃更改"需二次确认**：目录会递归执行 `git restore`（失败分支再 `git clean`），一次影响面大，故先弹确认对话框（`changesDiscardDirConfirm`）；文件级"放弃更改"保持即时执行。

---

## 工作区文件夹菜单（Git 全量操作）

> 变更导航器中每个工作区条目右侧「更多操作」（`button[aria-label="更多操作"]`）与工作区名称右键共用同一菜单：`.adl-multitree-entry__menu`。

| 菜单项       | 行为                                                                 | 选择器                                      |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------- |
| 暂存全部     | `git add -A`（含未跟踪与删除），成功后重读快照                       | `button[role="menuitem"]` 文本「暂存全部」  |
| 取消暂存     | 有 HEAD 时 `git restore --staged`（unborn 时 `git reset`）           | 文本「取消暂存」                            |
| 提交         | 打开提交弹窗（默认勾选「暂存全部并提交」），失败原因在弹窗内展示     | 文本「提交」                                |
| 推送         | 有 upstream 直接 push；无 upstream 时优先 `origin` 或唯一远程并 `-u` | 文本「推送」                                |
| 拉取         | `git pull --ff-only`（分叉由 git 报错原样展示）                      | 文本「拉取」                                |
| 放弃全部     | 二次确认后 restore + clean（无 HEAD 时先清索引再 clean）             | 文本「放弃全部」                            |

- 无变更时「暂存全部/提交/放弃全部」禁用；无已暂存内容时「取消暂存」禁用。
- **提交弹窗**：`.adl-commit-dialog`，多行输入 `#adl-commit-message`，`Ctrl/Cmd+Enter` 提交；提交中禁用输入与按钮；失败原因常驻 `role="alert"`。
- **放弃全部确认**：`.adl-confirm-dialog`；无 HEAD 的仓库使用专用文案，说明会清空索引并删除全部未忽略文件（`.gitignore` 项保留）。

### 操作

```javascript
// 暂存全部
await page.click('.adl-multitree-entry button[aria-label="更多操作"]');
await page.click('.adl-multitree-entry__menu button:has-text("暂存全部")');

// 提交（默认暂存全部并提交）
await page.click('.adl-multitree-entry button[aria-label="更多操作"]');
await page.click('.adl-multitree-entry__menu button:has-text("提交")');
await page.fill('#adl-commit-message', 'feat: demo');
await page.click('.adl-commit-dialog button:has-text("提交")');
```


#### 组合多选筛选

```javascript
// 依次点击多个状态按钮可实现组合筛选
await page.click('button[aria-label="已暂存"]');
await page.click('button[aria-label="已修改"]');
// 此时只显示 已暂存 + 已修改 的文件
```

### 状态变化

| 操作                 | 筛选结果                              |
| -------------------- | ------------------------------------- |
| 点击某个状态按钮     | 仅显示包含该状态的文件                |
| 点击多个状态按钮     | 显示包含任一选中状态的文件（OR 逻辑） |
| 取消所有选中         | 显示全部文件（等同于未筛选）          |
| 选中全部三种状态     | 显示全部文件（等同于未筛选）          |
| 再次点击已激活的按钮 | 取消该状态的筛选                      |

### 预期结果

- 筛选后左侧文件树/文件列表实时更新，仅显示匹配的文件
- 导航器顶部元数据计数反映筛选后的文件数量
- 选中状态按钮背景变为透明（与容器背景融合），悬停时显示灰色边框
- 筛选状态可通过再次点击该按钮取消

### 交互状态

| 状态         | 背景                             | 边框 |
| ------------ | -------------------------------- | ---- |
| 默认         | `var(--surface-raised)` 白色卡片 | 透明 |
| 悬停         | 透明（透出容器渐变背景）         | 灰色 |
| 激活（选中） | 透明（透出容器渐变背景）         | 透明 |

### 注意事项

1. 筛选仅影响左侧导航器的文件显示，不影响右侧变更预览内容。
2. 已暂存（S）/ 已修改（M）/ 未跟踪（U）徽标始终显示在文件项上，不受筛选影响。
3. 刷新文件树或 Git 状态后筛选状态保持，不会自动重置。

---

## 文档大纲

> 变更预览中的结构导航。支持文件树 / 文件列表 / 文档大纲三种导航模式。

### 定位选择器

| 优先级 | 类型       | 选择器                          |
| ------ | ---------- | ------------------------------- |
| 1      | aria-label | `button[aria-label="文档大纲"]` |
| 2      | CSS        | `.adl-outline-tree-shell`       |
| 3      | CSS        | `.adl-outline-tree__label`      |

### 操作

#### 切换到大纲视图

```javascript
await page.click('button[aria-label="文档大纲"]');
await page.waitForSelector(".adl-outline-tree");
```

#### 通过大纲跳转到变更位置

```javascript
await page.locator(".adl-outline-tree__label").first().click();
await page.waitForSelector('div[data-testid="changes-preview-shell"]');
```

### 行为约定

1. 变更大纲基于 `changePreview.currentContent` 生成，只反映当前修改侧内容。
2. 在内联 Diff 和并排 Diff 中，点击大纲项前通过 `findCollapsedSectionStart` 找到包含目标行的折叠区域，以折叠区域**首行位置**调用 `uncollapseUnchanged` 展开上下文，再跳到修改侧对应行。并排模式下同时对 A（原始）和 B（修改）侧展开。
3. 在 Markdown 预览模式下，点击大纲项优先滚动到预览正文标题（通过 `[data-source-line="N"]` DOM 选择器）；在代码预览 / Diff 模式下，跳转到代码视图对应行。
4. 变更大纲与文件大纲共用同一套树形组件和自绘滚动壳，滑块 hover / active 效果一致。

---

## 补丁预览

> 补丁差异预览

### 定位选择器

| 优先级 | 类型 | 选择器                                     |
| ------ | ---- | ------------------------------------------ |
| 1      | CSS  | `div[data-testid="changes-preview-shell"]` |
| 2      | CSS  | `.adl-tool-editor--changes`                |
| 3      | CSS  | `.adl-diff-toolbar`                        |

### 操作

#### 查看差异

```javascript
await page.click(".adl-patch-file-card__open");
await page.waitForSelector(".adl-diff-toolbar");
```

#### 切换预览/编辑

```javascript
await page
  .locator(".adl-tool-context__group--files-actions .adl-tool-context__iconbtn")
  .first()
  .click();
```

### 显示语义与视觉约定

> 变更工具中的内联 Diff、并排 Diff、折叠上下文、只读预览，共用同一套 CodeMirror 视觉语义。变更提示以“正文区整行/整块背景”为主，不依赖 gutter 二次强调。

#### 大文件/多行确认门（重型降级）

变更文件满足以下任一条件时，内容区先显示「内容较多，暂未直接打开」确认门（含体积与简化说明），点「仍然打开」后才渲染：

- `base`/`current` 任一侧字符数 > 1 MiB；
- `base`/`current` 任一侧行数 > 10000。

确认后以**简化模式**渲染：不挂 MergeView，改用只读 plain 文本编辑器（删除型展原文、新增型展新文、双侧都有则左右双栏），无语法高亮/逐字标红/合并按钮，增删行仍完整可审。介于 light 与 heavy 之间的文件走 **degraded**：保留语法高亮与折叠，但关闭行内变更高亮与折叠标记轮询。变更预览读取上限 8MB（与文件面板开文件一致），超限直接失败并提示。

| 视觉元素                 | 真实来源                                                                                          | 含义                                           | 作用                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| 绿色背景                 | `--editor-diff-insert-bg`                                                                         | 新增或修改行                                   | 快速扫描变更分布                                            |
| 红色背景                 | `--editor-diff-remove-bg`                                                                         | 删除行                                         | 让删除信息与新增信息在阅读上立即分离                        |
| 行号区背景               | `--editor-diff-insert-gutter-bg` / `--editor-diff-remove-gutter-bg`                               | 行号区变更行标识（比内容区稍深，形成视觉层次） | 辅助定位变更行位置                                          |
| 行内更亮的绿色底部高亮线 | CodeMirror merge 的行内 changed-text 语义                                                         | 该变更行内部还有更细的词/字符级差异            | 在长行内快速定位真正改动的片段                              |
| 选中 hunk 的浅蓝描边     | `--editor-current-hunk-ring`                                                                      | 当前聚焦的补丁块                               | 辅助键盘导航、接受/拒绝操作和上下文跟踪                     |
| 并排 Diff 渐变分隔层     | `.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-mergeViewEditor:first-child::after` | 左右版本边界 + 左侧退后右侧浮出                | 透明→背景色的水平渐变（6px 宽），模拟"左低右高"的卡片分层感 |
| 折叠区块控件             | `.cm-collapsedLines`                                                                              | 被收起的未变更上下文                           | 减少长 Diff 噪音，同时保留展开入口                          |

### 行号切换行为

> 通过"更多操作"菜单中的"行号"选项可切换行号显示（内联 Diff 和并排 Diff 均支持）。

| 状态    | 行号数字 | 折叠图标                                                               | gutter 区域        |
| ------- | -------- | ---------------------------------------------------------------------- | ------------------ |
| ✅ 开启 | 显示     | 显示（auto-hide：打开文件时显示1秒后自动隐藏，鼠标进入行号区重新显示） | 正常宽度           |
| ❌ 关闭 | 隐藏     | 隐藏                                                                   | 完全消失，正文左移 |

> 取消行号时，整个 gutter 区域（行号数字 + 折叠/展开图标）全部消失，正文内容向左移动占满空间。
>
> 折叠图标默认隐藏，仅在以下情况显示：打开文件时短暂显示1秒、鼠标悬停在行号区、鼠标悬停在单个图标上。

### 国际化支持

> CodeMirror 编辑器内置 phrase 国际化机制，折叠区块控件文案随应用语言切换自动变化。

| 语言            | 折叠区块文案        | 还原按钮          | 接受按钮 | 拒绝按钮 |
| --------------- | ------------------- | ----------------- | -------- | -------- |
| 中文 (zh-CN)    | `N 行无变化`        | 还原此块          | 接受     | 拒绝     |
| English (en-US) | `N unchanged lines` | Revert this chunk | Accept   | Reject   |

> `locale` prop 通过 `appInfo.config.language` 传入 CodeEditor / DiffViewer，由 `getPhrasesExtension(locale)` 生成 `EditorState.phrases` 扩展。

### 滑动条菜单

> 缩略图（Minimap）与右侧滚动区右键菜单均已移除；当前滚动区域只保留标准滚动行为与项目自绘滚动条。

### 刷新按钮

> 变更面板支持两个层次的刷新操作：

#### 全局刷新按钮

> 变更文件统计数字右侧的刷新按钮，刷新所有可见工作区的 Git 快照。

| 操作           | 调用                                             |
| -------------- | ------------------------------------------------ |
| 刷新全部工作区 | `handleRefreshAllChanges()`                      |
| 每个工作区调用 | `refreshGitSnapshot(workspaceId, workspacePath)` |

#### 单个工作区刷新按钮

> 每个工作区变更条目右侧的刷新按钮（hover 时显示），单独刷新该工作区的 Git 状态。

| 操作           | 调用                                             |
| -------------- | ------------------------------------------------ |
| 刷新单个工作区 | `handleRefreshOneWorkspace(workspaceId)`         |
| 实际执行       | `refreshGitSnapshot(workspaceId, workspacePath)` |

#### 刷新行为

1. **加载状态**：刷新时工作区条目显示加载指示器
2. **错误处理**：如果刷新失败，显示错误提示
3. **状态重置**：刷新完成后加载状态自动清除

### 已移除的冗余提示

| 已移除元素                          | 原因                                         |
| ----------------------------------- | -------------------------------------------- |
| 行号区域与正文区域同时显示红/绿竖线 | 同一语义被重复强调，视觉负担过重             |
| 行号区域的小圆点 / 独立变更 gutter  | 与正文内的块级背景重复，不再提供额外信息价值 |
| 点击编辑器后四周出现的虚线焦点边框  | 不属于 Diff 语义，会打断连续阅读             |
| gutter 与正文之间的额外分隔缝隙     | 会把 Diff 阅读面割裂成两个层次               |

### 颜色 token 对照

| token                            | 含义                                        |
| -------------------------------- | ------------------------------------------- |
| `--editor-diff-insert-bg`        | 新增/修改行的绿色背景（内容区）             |
| `--editor-diff-remove-bg`        | 删除行的红色背景（内容区）                  |
| `--editor-diff-insert-gutter-bg` | 新增/修改行号区背景（比内容区深，形成层级） |
| `--editor-diff-remove-gutter-bg` | 删除行号区背景（比内容区深，形成层级）      |
| `--editor-diff-insert-hover`     | 新增行悬停/激活态背景                       |
| `--editor-diff-remove-hover`     | 删除行悬停/激活态背景                       |
| `--editor-selection`             | 修改或选中文本的中性浅蓝强调                |
| `--editor-current-hunk-ring`     | 当前聚焦 hunk 的环形描边                    |

### 注意事项

1. Diff 的主语义在正文区，gutter 只保留基础行号定位和稍深的变更行标识。
2. green/red 深浅层级：内容区（18-20%）< 行号区（28-30%）< 悬停态（35%），依次加深形成视觉层次。
3. 空变更行（无字符的行）的悬停背景色与非空行一致。由于 `.cm-insertedLine`/`.cm-deletedLine` 是行内 `<ins>`/`<del>` 元素，空行无此元素导致 `:has()` 不匹配，因此额外使用 `.cm-changedLine:hover` 选择器兜底。
4. 若未来要进一步降噪，优先考虑收弱行内底部高亮线，而不是重新引回 gutter 状态条。

---

## 媒体与办公文件预览

> 变更面板与文件面板可打开的类型一致：图片/音视频在变更面板直接预览（mp4 走原生 `<video>`），docx/pdf/xlsx/pptx 复用文件面板渲染器，不做逐行 diff。

| 状态                 | 展示                                                                 | 选择器                          |
| -------------------- | -------------------------------------------------------------------- | ------------------------------- |
| 媒体加载             | 骨架占位（`.adl-preview-loading`）                                   | `.adl-preview-loading`          |
| 媒体/文档预览        | 与文件面板同一渲染器（`.adl-media-preview` / `.adl-docx-preview` 等） | 对应预览器类名                  |
| 解码失败             | 错误文案 + 两个浏览器兜底按钮（仅桌面 WebView2）                     | `.adl-preview-external`         |
| 媒体读取失败（删除型） | 错误文案 + 「重试」+ 兜底按钮                                       | `.adl-unsupported-preview`      |

- 兜底按钮只在扩展名属于 WebView2 原生可渲染白名单（html/pdf/svg/标准图片/音视频）**且**运行在桌面壳时出现；浏览器模式的浏览器面板是 iframe，会拦截 `file://`，故不显示。
- 「重试」落在预览所属工作区（不读当前工作区目录）；工作区已从侧栏移除时不回退。

---

## 补丁操作

> 应用/回滚补丁

### 按钮列表

| 按钮        | aria-label          | 说明                       |
| ----------- | ------------------- | -------------------------- |
| 预览 / 编辑 | 文件预览 / 文件编辑 | 眼睛图标按钮，切换右侧视图 |
| 应用补丁    | 应用补丁            | 应用所有补丁               |
| 回滚补丁    | 回滚补丁            | 回滚所有补丁               |
| 接受        | 接受                | 接受当前补丁块             |
| 拒绝        | 拒绝                | 拒绝当前补丁块             |

### 操作

```javascript
await page.click('button[aria-label="应用补丁"]');
await page.click('button[aria-label="回滚补丁"]');
```

---

## 空态

> 变更面板右侧在无内容时显示的状态。

### 状态行为

| 场景                        | 显示内容                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 有变更文件但未选择预览      | 空白（不显示任何提示）                                                                                                                   |
| 无变更文件且已打开工作区    | 显示"当前没有检测到文件变更"                                                                                                             |
| 无工作区                    | 显示"点击顶部标题栏 [添加工作区图标] 按钮添加工作区"                                                                                     |
| 已打开工作区但不是 Git 仓库 | 显示"非 Git 仓库" + "初始化为 Git 仓库"按钮；按钮内部右侧 `!` 承载说明（什么是 Git 仓库 / 为什么需要 / 初始化后变化 / 只初始化本地仓库） |

### 定位选择器

| 优先级 | 类型 | 选择器                |
| ------ | ---- | --------------------- |
| 1      | CSS  | `.adl-empty-hint`     |
| 2      | CSS  | `.adl-changes-nongit` |

### 视觉设计

- 居中布局：文字在容器中水平和垂直居中
- 无工作区：文案中间嵌入标题栏「添加工作区」同款 `IconFolderPlus` 图标
- 非 Git 仓库：无卡片底色、无 Git 图标；标题为灰色 `--text-muted` / `--text-xs`；按钮常驻 1px 边框、四角直角、字号同普通提示文案；`!` 位于按钮内部右侧
- 文字样式：使用 `--text-muted` 颜色，`--text-xs` 字号

---

## 相关元素

| 元素        | 选择器                                     | 说明                 |
| ----------- | ------------------------------------------ | -------------------- |
| 变更面板    | `#changes-panel`                           | 变更面板容器         |
| 变更列表    | `.adl-patch-file-card`                     | 变更文件卡片         |
| Diff 工具条 | `.adl-diff-toolbar`                        | 变更预览工具栏       |
| 预览编辑器  | `div[data-testid="changes-preview-shell"]` | 差异/只读预览容器    |
| 空态提示    | `.adl-empty-hint`                          | 变更面板空态提示文本 |
