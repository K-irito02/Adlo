# 浏览器工具面板

> 内置浏览器面板，支持双模式：Tauri 桌面模式使用系统 WebView，浏览器预览模式使用 `<iframe>` + 外部浏览器降级按钮。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-panel--browser` | 浏览器面板容器 |

---

## 工具栏

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-context--files` |

### 操作

#### 后退

```javascript
await page.click('button[aria-label="后退"]');
```

#### 前进

```javascript
await page.click('button[aria-label="前进"]');
```

#### 刷新

```javascript
await page.click('button[aria-label="刷新"]');
```

#### 导航模式切换（v2026-06-20 新增）

> 切换"新建标签"和"就地导航"模式。使用 `@radix-ui/react-switch` + `motion` 实现动效。

**选择器：** `.adl-browser-nav-mode-switch`

**状态检测：**
- OFF（滑块在左）：`aria-label` 匹配 `browserNavigateNewTab` i18n key → 新建标签模式
- ON（滑块在右）：`aria-label` 匹配 `browserNavigateInPlace` i18n key → 就地导航模式

**操作：**

```javascript
// 点击切换
await page.click('.adl-browser-nav-mode-switch');

// 验证当前状态（以中文为例）
const label = await page.getAttribute('.adl-browser-nav-mode-switch', 'aria-label');
expect(label).toBe('就地导航：新链接在当前标签打开');  // ON 状态
// 或
expect(label).toBe('新建标签：新链接在新标签打开');    // OFF 状态
```

**网页内链接跳转行为**（v2026-08-21）：

无论"新建标签"还是"就地导航"模式，**网页内链接的普通左键点击（含 `target="_blank"` 的站内链接）一律在当前标签导航**，不新建标签；仅 **Ctrl/Shift/中键点击**（用户显式新标签意图）与网站 JS 的 `window.open` 弹窗仍打开新标签。回退/前进保持一次到位（C1 pushState 归一化 + smartGoBack）。

#### 地址栏

```javascript
// 展开地址栏（需要先展开才能输入）
await page.click('.adl-tool-search--address');

// 输入 URL
await page.fill('.adl-tool-search--address input', 'https://example.com');

// 按 Enter 导航
await page.keyboard.press('Enter');
```

**地址栏聚焦/失焦行为**（v2026-06-21）：
- 点击地址栏展开 → 自动聚焦并全选文本
- 按 Enter → 提交导航
- 按 Escape → 恢复原始 URL，折叠地址栏（不导航）
- 点击页面其他地方（blur）→ 恢复原始 URL，折叠地址栏（不导航）

```javascript
// 验证 blur 恢复（删除 URL 后点击空白区域，应恢复为原始 URL）
await page.fill('.adl-tool-search--address input', '');
await page.click('.adl-tool-primary--browser'); // 点击内容区域触发 blur
// 地址栏折叠；重新展开后应看到原始 URL
await page.click('.adl-tool-search--address');
```

**空 URL + Enter → 着陆页**（v2026-06-21）：
```javascript
// 清空地址栏并按 Enter，应显示着陆页
await page.fill('.adl-tool-search--address input', '');
await page.keyboard.press('Enter');
// 内容区应显示 Landing Page（.adl-browser-landing），内容区非空白
await expect(page.locator('.adl-browser-landing')).toBeVisible();
```

#### 复制链接（地址栏，v2026-06-18 新增动画）

```javascript
// 展开地址栏（需要先展开才能看到复制按钮）
await page.click('.adl-tool-search--address');

// 点击复制链接按钮
await page.click('.adl-copy-btn');

// 复制成功后图标播放动画，Tooltip 显示"已复制到剪贴板"
// 1.5 秒后自动恢复为"复制链接"提示
```

**选择器**：`.adl-copy-btn`（复制按钮，仅在地址栏展开或悬停时显示）

**行为**：点击复制 URL → 图标播放 lucide-animated 弹簧动画（~400ms）→ 500ms 后图标恢复原位 → Tooltip 显示"已复制到剪贴板"（1.5s）

#### 新建标签页

```javascript
await page.click('button[aria-label="新建标签页"]');
```

#### 新建标签（导航器）

```javascript
// 在导航器树目录行上点击「+」按钮（弹 CreateTabDialog）
await page.click('.adl-browser-entry .adl-icon-btn');
```

**新建标签对话框**（v2026-06-09 新增）：

点击"新建标签"按钮后，弹出 `CreateTabDialog`（Portal → `document.body`），含两个输入项：

| 字段 | 选择器 | 填写内容 |
|------|--------|----------|
| 标签名称 | `.adl-prompt-modal__input:first-of-type` | 标签显示名称 |
| 网址 | `.adl-prompt-modal__input:nth-of-type(2)` | 目标网址（自动补 `https://`） |

```javascript
// 通过对话框创建标签
await page.fill('.adl-prompt-modal__input:first-of-type', 'GitHub');
await page.fill('.adl-prompt-modal__input:nth-of-type(2)', 'github.com');
await page.click('button:has-text("新建标签")');
```

#### 更多操作菜单（2026-11-27 调整）

工具栏最右侧 `IconMoreVertical` 打开。中心与右侧浏览器面板共用同一份菜单项。

| 分组 | 项目 | 行为 |
|------|------|------|
| — | 强制刷新 | 忽略本地缓存重新加载当前标签（CDP `Page.reload{ignoreCache}`） |
| Cookie | 清除本站 Cookie / 清除全部 Cookie | 前者按域名删除本站 cookie（含父域；同父域兄弟子域会一并退出登录）；后者清空所有站点的 cookie |
| 缓存 | 清除本站缓存 / 清除全部缓存 | 前者清本站离线数据/草稿（**不含 Cookie**），后者清所有网站的图片/样式缓存 |
| 清理后重载 | 上述四项 | 清理完成后都会重新加载**当前标签**，不会重载另一个面板或后台标签 |
| — | 打开开发者工具 | 为当前标签打开独立 DevTools 窗口（显示该网页的 DOM，不是应用自身 UI） |
| — | 放大 / 缩小 / 重置 | 当前标签缩放，每次 10%，范围 50%–200% |
| — | 导入书签 / 导出书签 | 书签文件迁移 |

Cookie 两项相邻、缓存两项相邻，两组之间一条分隔线。「复制网址」（地址栏已有复制按钮）与「清除历史」（历史面板自带删除入口）已从菜单移除。

浏览器预览模式没有可调试/可清理的原生 WebView，上述桌面专属项目禁用，悬停提示「仅桌面版支持」。清理类操作没有确认弹窗，操作结果通过 toast 反馈；失败会提示具体原因（如标签尚未以原生窗口加载）。

### 音频指示器与静音控制（v2026-06-27 新增）

> 浏览器面板为正在播放音频的标签提供音频状态指示器与静音切换功能。

**选择器**：`.adl-browser-audio-indicator`

**状态检测**：
- `.is-animating`（动画中）：标签正在播放音频
- `.is-muted`（静音图标）：标签已被静音

**操作：**

```javascript
// 点击音频指示器切换静音状态
await page.click('.adl-browser-audio-indicator');
```

**位置**：favicon 右侧，标签名称左侧

**覆盖范围**（v2026-08-21，v2026-11-15 修订）：音频指示器不仅显示在"已打开标签页"的标签上，**书签/收藏目录中的条目、以及历史目录中当日（与访问日期同一天）的条目**也会与当前打开标签按同一 URL 匹配显示——视频有声音时对应条目稳定出现音量图标。匹配使用收藏身份键 `bookmarkUrlKey`（协议 + 主机含端口 + 归一化路径/query，剥离跟踪参数/尾斜杠/www），不同端口或协议的本地服务不会互相点亮。

**行为差异**：

| 模式 | 音频检测 | 静音控制 |
|------|----------|----------|
| Tauri 桌面 | WebView2 原生 COM 事件 `IsDocumentPlayingAudioChanged` | WebView2 `SetIsMuted()` 真实静音 |
| 浏览器 iframe（同域） | iframe `audioprocess` / `play` / `pause` 事件检测 | 前端状态记录，不实际影响音频 |

**注意**：
- 跨域 iframe 无法自动检测音频播放，仅支持手动静音/取消静音
- 静音状态在标签切换后保持（对应 WebView2 的 `IsMuted` 标记持久化）
- 页面播放/暂停不会覆盖用户设置的静音状态（`webview2_audio.rs` 中通过 `ICoreWebView2_18.IsMuted()` 读取实际状态）

**功能差异**（v2026-06-27 修订）：

| 导航器模式 | aria-label | 点击行为 |
|-----------|------------|----------|
| 已打开的标签（open） | `新建标签页` | 直接打开一个空白新标签 |
| 书签目录（tabs） | `新建标签` | 弹出 `CreateTabDialog`（需先选中目录，否则 toast 提示） |

**触发入口**：

| 触发位置 | 选择器 | 说明 |
|----------|--------|------|
| 导航器工具栏（open 模式） | `button[aria-label="新建标签页"]` | 直接打开空白新标签 |
| 树目录行按钮 | `.adl-browser-entry .adl-icon-btn` | 在该目录下新建标签（弹 `CreateTabDialog`；未选中目录时 toast 提示） |

**取消操作**：点击"取消"按钮、按 Esc 键、或点击遮罩层，均关闭对话框且不创建标签。

**计数行为**：仅在用户点击"新建标签"确认后才调用 `browserOpenTab`，`navigatorCount` 仅反映真实创建数。取消操作不增加计数。

#### 新建目录（导航器）

```javascript
// 在导航器上下文区域点击新建目录按钮
await page.click('button[aria-label="新建目录"]');
```

---

## 搜索区域

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-navigator__context--search` |

### 搜索范围切换

搜索区域包含三个切换按钮，与变更面板样式一致：

| 按钮 | aria-label | 说明 |
|------|------------|------|
| 收藏 | `收藏` | 搜索收藏的标签 |
| 历史 | `历史` | 搜索历史记录 |
| 全部 | `全部` | 搜索所有内容 |

```javascript
// 切换到收藏搜索
await page.click('button[aria-label="收藏"]');

// 切换到历史搜索
await page.click('button[aria-label="历史"]');

// 切换到全部搜索
await page.click('button[aria-label="全部"]');
```

### 搜索输入框

```javascript
// 在搜索框中输入关键词
await page.fill('.adl-tool-search--navigator input', '关键词');
```

---

## 导航器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-navigator` |

### 多工作区布局

浏览器面板采用多工作区布局，包含：
- **工作区目录**：显示各工作区的标签
- **自建目录**：用户自定义的书签文件夹
- **历史目录**：自动记录的访问历史（最多 1000 条、保留 180 天，去重）

> 2026-09-30 修订：三分类标题行为静态文本（常展开，无收起/展开按钮），标题与首目录间距收紧、分类之间距 16px。
>
> 2026-11-07 修订：分类空态与目录空态：
> - 工作区目录为空：`点击顶部标题栏 [IconFolderPlus] 按钮创建工作区目录`（图标与标题栏「添加工作区」一致）。
> - 自建目录为空：`点击此侧边栏上方 [IconNewFolderBrowser] 按钮创建自建目录`（图标与侧边栏「新建目录」一致）。
> - 历史目录为空：`暂无历史记录`，不再渲染空的「历史记录」根节点。
> - 目录展开后无子项：显示 `空目录`（原「暂无内容」）。
> - 「书签列表」模式下「新建目录」按钮同样可见，指引与实际入口一致。

### 标签页

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-list__item` | 书签/历史/搜索结果条目 |
| `.adl-multitree-entry__header` | 工作区/文件夹头部行 |
| `.adl-multitree-entry__tree` | 展开的子内容区域 |
| `.adl-multitree-scroll` | 历史记录滚动容器 |

### 历史记录

历史记录显示在"历史目录"下，支持：
- 自动记录访问过的网址
- 去重处理；最多保留 1000 条，超过 180 天的条目在启动或新增记录时自动清理
- 按时间显示（刚刚、N分钟前、N小时前、N天前）
- 点击在新标签页打开
- 使用自定义滚动条，位于左侧（left: 6px），z-index: 3
- 顶层「历史记录」悬停只显示「删除全部历史记录」；年/月/日目录悬停只显示「删除目录」（删除该目录及嵌套内容）；两种层级都不再提供更多按钮或右键菜单
- 历史为空时顶层「历史记录」常驻并展开，显示「暂无历史记录」

### 计数规则

导航器各级节点的右端数字含义如下：

| 节点类型 | 计数含义 | 示例 |
|---------|---------|------|
| 分类行（"工作区" / "自建" / "历史"） | 该分类下的**顶级目录数** | "工作区 3" = 3 个工作区 |
| 顶级目录 | **直接子标签数**（不含子目录） | "前端项目 5" = 5 个直接子标签 |
| 子目录（非历史） | **直接子节点数**（子目录 + 标签） | "Web 8" = 8 个直接子节点 |
| 历史子目录 | **直接子节点数**（同历史子目录） | "今天 12" = 12 条今天的历史 |
| URL 标签 / 历史条目 | **不显示计数** | （无数字） |

**显示行为**：
- 计数为 `0` 也要显示（"Web 0"），仅当节点是 `file` 类型才隐藏
- 鼠标悬停整行时计数自动隐藏，露出"删除 / 重命名 / 移动"操作按钮
- 顶级目录计数右偏移 `var(--space-3)`（12px），子目录计数也右偏移 `var(--space-3)` 保证像素级对齐（DOM `getBoundingClientRect().right` 实测一致）

### 导航器头部计数（2026-06-02 修订）

浏览器面板头部（地址栏右侧）显示统一标题 `t.toolBrowser`（「浏览器」）与计数 `openTabCount`：

- `openTabCount` = `browserTabs.filter(isPanelTab).length`（右侧面板内的标签数），**不随 `navigatorMode` 变化**。
- `computeNavigatorCount` 目前无生产消费方（仅 barrel 导出 + 单测）；不要按它的旧语义推断 UI 行为。

> 历史变更：第 28 轮之前固定显示"书签目录 N"——其中 N 仅 `browserTabs.length`，与标题语义不一致。现已统一标题为「浏览器」，计数固定为面板标签数。

**自动化要点**：

```javascript
// 获取某行的计数文本
const text = await page.locator('.adl-browser-entry__header .adl-browser-entry__trailing').textContent();

// 判定行类型
const isCategory = await page.locator('.adl-browser-entry__header').count() > 0;
const isFile = await page.locator('.adl-filetree__node--file').count() > 0;
```

**相关选择器**：

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-entry__trailing` | 顶级目录计数容器（位于头部行右侧） |
| `.adl-filetree__count` | 子目录/文件计数容器 |
| `.adl-tree-node__count` | 通用树节点计数容器 |

### 收藏标签对话框（v2026-06-15 新增）

点击收藏标签按钮（`button[aria-label="收藏标签"]`）弹出 `BookmarkToFolderDialog` 模态对话框（Portal → `document.body`），取代之前的直接切换行为。

#### 对话框布局

```
┌──────────────────────────────────┐
│ 收藏标签                      ✕ │ ← 标题 + 关闭按钮
├──────────────────────────────────┤
│ [⟐ 全部展开]    [📁 + 新建目录 !]│ ← 工具栏：左为展开/折叠，右为新建目录
├──────────────────────────────────┤
│ 工作区目录                       │ ← 目录树：只显示目录层级
│  ├─ 项目A                        │   （不显示标签/文件叶节点）
│  │  └─ 子模块                    │
│  └─ 项目B                        │
│ 自建目录                     │
│  └─ 我的收藏                     │
├──────────────────────────────────┤
│      [取消]    [加入此目录]      │ ← 底部操作按钮
└──────────────────────────────────┘
```

#### 操作说明

| 操作 | 行为 |
|------|------|
| 点击目录行 | 选中该目录，同时展开/折叠子目录（如果有） |
| 点击展开箭头 | 仅展开/折叠，不改变选中状态 |
| 展开/折叠全部按钮 | 在全部展开 ↔ 全部折叠之间切换目录树 |
| 新建目录 | 选中目录时：在其下创建子目录；未选中时：在"自建目录"下创建顶级目录 |
| "!" 提示 | 悬停显示两种情况的列点说明 |
| 加入此目录 | 收藏当前标签到选中目录；未选中时 toast 提示"请先选择一个目录" |
| 点击目录树外区域 | 取消当前选中状态 |

#### 选择器

| 元素 | 选择器 |
|------|--------|
| 对话框面板 | `.adl-prompt-modal__panel--bookmark` |
| 新建目录按钮 | `button.adl-bookmark-dir-toolbar__btn--with-hint` |
| "!" 提示 | `.adl-bookmark-dir-toolbar__btn-hint` |
| 目录行 | `.adl-bookmark-dir-row` |
| 选中态 | `.adl-bookmark-dir-row.is-selected` |

```javascript
// 使用书签对话框
await page.click('button[aria-label="收藏标签"]');
await page.click('.adl-bookmark-dir-row'); // 选择一个目录
await page.click('button:has-text("加入此目录")');
```

**书签星号在空标签上的行为**（v2026-06-21）：
- 着陆页（空标签，URL 为空）→ 书签星号始终为空心（未收藏状态）
- 点击星号 → 弹出收藏对话框（等同于非书签页面的行为）
- 空标签不会被收藏到书签列表

```javascript
// 验证空标签上的书签状态
// 确保当前在 Landing Page
await expect(page.locator('.adl-browser-landing')).toBeVisible();
// 书签星号应为空心（未收藏）
const starBtn = page.locator('button[aria-label="收藏标签"]');
const isBookmarked = await starBtn.getAttribute('data-bookmarked');
expect(isBookmarked).toBe('false'); // 或 aria-pressed="false"
```

### 子目录管理

子目录（标签工作区）可在导航器中创建和管理：

```javascript
// 从工作区头部行更多操作菜单创建子目录
await page.click('[data-menu-btn-id]:first-child'); // 点击更多操作
await page.click('text=创建子目录');

// 展开工作区查看子目录
await page.click('.adl-multitree-entry__expand-btn:first-child');

// 子目录下的嵌套子目录
// 在已存在的子目录头部行上点击更多操作 → 创建子目录
```

**注意事项**：
- 创建子目录后需手动展开工作区才能看到
- 子目录的 `parentId` 通过 4 层回调链传递（WorkspaceBrowserEntry → MultiWorkspaceBrowser → BrowserPanel → browserSlice）
- 清除 localStorage 后会丢失所有子目录数据

### 目录选中与交互

#### 标签右键菜单（v2026-06-22 新增，v2026-06-23 更新）

导航器树中标签（工作区目录/自建目录）支持右键菜单，共 8 项操作：

| 菜单项 | 说明 | 图标 |
|--------|------|------|
| 在当前标签打开 | 在当前标签中导航到该 URL | — |
| 在新标签打开 | 创建新标签并导航到该 URL | — |
| 在「中间区」打开 | 以该 URL 新建一个中心标签 | — <!-- glossary-allow: 引用界面文案 -->
| 刷新Logo/标题 | 重新获取 Logo 图标和标题（清除旧缓存，保留用户自定义名称） | "!" 提示卡 |
| 编辑 | 弹出编辑对话框（与新建标签对话框相同，预填当前值） | — |
| 复制链接 | 复制 URL 到剪贴板 | — |
| 收藏/取消收藏 | 按 URL 切换收藏状态（书签行恒显示「取消收藏」并只删当前条目） | — |
| 删除 | 彻底删除标签及所有关联状态（书签、工作区书签、文件夹、缓存） | — |

> 「在「中间区」显示」只出现在**列表模式**的活标签行右键菜单与「已打开标签页」的标签右键菜单（把现有标签移入中心），树模式不显示。 <!-- glossary-allow: 引用界面文案 -->

**"!" 提示卡**（`browserRefreshMetaHint`）：悬停 "!" 图标弹出浮动提示卡（`.adl-sub-hint-card`），说明刷新功能细节

**触发方式**：右键点击标签行

**选择器**：`.adl-multitree-entry__menu-item`（右键菜单项）、`.adl-menu-item__hint`（"!" 图标）

#### 标签悬停按钮（v2026-06-22 新增，v2026-06-23 更新）

鼠标悬停标签行时，右侧浮现三个操作按钮：

| 按钮 | 图标 | 说明 |
|------|------|------|
| 关闭 | `IconClose` | 关闭标签（保留书签），悬停变红；悬停提示为自定义 Tooltip（v2026-10 起改回，Webview2 遮挡由 tooltip 自身避让解决） |
| 刷新Logo/标题 | `IconRefreshCw` | 与右键菜单"刷新Logo/标题"功能一致 |
| 更多操作 | `IconMoreVertical` | 点击弹出右键菜单 |

**选择器**：`.adl-browser-node__actions` + `.adl-icon-btn--xs`、`.adl-icon-btn--danger-hover`（关闭按钮悬停变红）

#### 导航模式与书签列表（v2026-06-23 新增，v2026-11-15 更新）

工具栏提供三个导航按钮：`已打开标签页`、`书签目录`、`书签列表`（另有搜索模式）：

| 模式 | 说明 |
|------|------|
| 已打开标签页 | 只显示已打开的标签，扁平列表（不分组、无分类头），历史不出现 |
| 书签目录 | 工作区 / 自建目录 / 历史三分类的树形视图；目录内书签行即使没有活标签也可展开操作 |
| 书签列表 | 把书签目录内的书签（以及历史）摊平为列表；首屏渲染 80 行，滚动到底继续追加，选中项即使超出首屏也会保留渲染 |

**已打开标签页模式的特性**：

| 特性 | 说明 |
|------|------|
| 扁平列表 | 直接列出已打开标签的行（`.adl-filetree__row`），不渲染工作区/目录分类头 |
| 切换标签不刷新 | 使用多 iframe 堆叠方案，每个标签的 iframe 保持挂载，切换时仅切换可见性 |
| 新标签页 favicon（v2026-08-21） | "新建标签页"（无 URL）标签的 favicon 显示内置窗口图标（`IconNewTabPage`，非空白） |
| 标签加载状态（v2026-08-24） | 活标签（标签条/已打开标签页列表/树内活标签行）：favicon 未缓存/未结算时显示加载中 spinner；标题未结算时标签栏显示"新建标签页"扫光动效（`titleResolved` 状态机）。favicon 加载失败（degraded）或确认无图标时显示站点首字母兜底 |
| 书签/历史行占位（v2026-11-12） | 书签、历史、搜索结果里的收藏行属于被动列表：未结算时**直接显示站点首字母**，不转圈、不挂 5s 计时器；展开/折叠不再重复出现加载态。导入书签自带的 `ICON` 快照会播种进站点元数据镜像立刻显示，真实图标（data-URI 广播）到达后原地替换 |
| 图标重挂记忆（v2026-11-15） | 已成功显示过的图标 / 该页面上次显示的图标按会话记忆；折叠/展开、目录↔列表切换重挂时首帧直接复用，不再退回占位 |

**中心动作（v2026-11-15 新增）**：

- 书签 / 历史 / 标签行右键菜单：「在「中间区」打开」——以该书签 URL 新建一个中心标签。 <!-- glossary-allow: 引用界面文案 -->
- 目录 / 工作区 / 历史「日」右键菜单：「全部在「中间区」打开」——递归收集其下全部 URL（含工作区根目录与嵌套目录，按严格 URL 身份去重）后逐个打开到中心。 <!-- glossary-allow: 引用界面文案 -->
- 「已打开标签页」中的已打开标签右键菜单：「在「中间区」显示」——把现有标签移动到中心（不新建）。 <!-- glossary-allow: 引用界面文案 -->
- 中心标签标题栏的「回到面板」按钮 tooltip 统一为「在右侧面板显示」（浏览器/终端标签共用）。

**自动化测试：**
```javascript
// 验证已打开标签页模式是扁平列表（中文环境）
// 1. 确保有多个面板标签
// 2. 点击"已打开标签页"按钮
await page.click('[aria-label="已打开标签页"]');

// 3. 不出现工作区/历史分类头或目录行
await expect(page.locator('.adl-browser-entry__header')).toHaveCount(0);
await expect(page.locator('.adl-filetree__node--directory')).toHaveCount(0);
// 4. 至少有一行标签
await expect(page.locator('.adl-filetree__row').first()).toBeVisible();
```

#### 目录右键菜单（v2026-06-23 新增，v2026-06-26 更新）

导航器树中目录支持右键菜单，菜单项因 **三级分类类型**（`categoryType`）和 **节点类型**（`nodeType`）组合不同：

##### 工作区目录 / 自建目录（workspace folder / userFolder folder）

| 菜单项 | 类型 | 说明 | "!" 提示卡 |
|--------|------|------|-----------|
| 在新标签全部打开 | 通用 | 在新建标签中打开目录下所有标签 | — |
| 全部在「中间区」打开 | 通用 | 递归收集目录（含嵌套/工作区根目录）内全部 URL，按严格 URL 身份去重后逐个新建中心标签 | — <!-- glossary-allow: 引用界面文案 --> |
| 从视图移除 | 工作区目录 | 从浏览器视图移除工作区 | — |
| 重命名 | 自建目录 | 重命名目录名称 | — |
| 删除所有标签[嵌套] | 通用 | 删除自身 + 嵌套目录下的全部标签，保留目录结构 | ✅ |
| 删除自身目录标签 | 通用 | 仅删除自身目录下的直接子标签，不碰嵌套目录 | ✅ |
| 删除此目录 | 自建目录 | 删除目录及所有结构和子标签 | ✅ |

##### 历史目录 · 日节点（history day）

| 菜单项 | 类型 | 说明 | "!" 提示卡 |
|--------|------|------|-----------|
| 在新标签全部打开 | 通用 | 在新建标签中打开该日全部历史记录 | — |
| 全部在「中间区」打开 | 通用 | 该日全部历史 URL 去重后逐个新建中心标签 | — <!-- glossary-allow: 引用界面文案 --> |
| 删除自身目录标签 | 日专用 | 删除该日所有历史记录标签（空目录自动消失） | ✅ |
| 删除此目录 | 日专用 | 删除该日所有历史记录标签（效果同上） | ✅ |

**注意**：对"日"节点而言，因日目录只有直接子标签（无嵌套结构），"删除自身目录标签"和"删除此目录"效果相同。年/月/日目录为动态计算节点（无底层持久化实体），空目录自动从树中移除。

##### 历史目录 · 根节点（history root 右键菜单）

| 菜单项 | 类型 | 说明 | "!" 提示卡 |
|--------|------|------|-----------|
| 删除全部历史记录标签 | 根专用 | 清除全部历史记录标签及所有年/月/日目录结构 | ✅ |
| 删除全部历史记录 · 年 | 根专用 | 删除所选年份的全部历史记录及对应年/月/日目录 | ✅ |
| 删除全部历史记录 · 月 | 根专用 | 删除所选月份的全部历史记录及对应月/日目录 | ✅ |
| 删除全部历史记录 · 日 | 根专用 | 删除所选日的全部历史记录及对应日目录 | ✅ |

**"!" 提示卡**：悬停 "!" 图标弹出 `.adl-sub-hint-card`，解释各删除操作的范围

**触发方式**：右键点击目录头部行，或点击目录头部行"更多操作"按钮

**选择器**：`.adl-multitree-entry__menu` + `data-menu-id`、`.adl-menu-item__hint`（"!" 图标）

#### 标签编辑对话框（v2026-06-22 新增）

从右键菜单"编辑"触发，与新建标签对话框 UI 一致。标题为"编辑标签"，确认按钮为"保存"。

```javascript
// 右键点击标签行
await page.locator('.adl-filetree__item').first().click({ button: 'right' });

// 点击右键菜单项
await page.click('.adl-multitree-entry__menu-item:has-text("编辑")');

// 修改后保存
await page.fill('.adl-prompt-modal__input:first-of-type', '新名称');
await page.click('button:has-text("保存")');
```

#### 选中状态：
- 点击顶级目录或子目录时会显示灰色背景（`--surface-active`）
- 只有最后被点击的项会显示选中状态
- 点击页面其他区域会取消选中状态

#### 目录展开/折叠：
- 点击顶级目录的任何位置都会触发展开/折叠（不仅仅是箭头按钮）
- 点击子目录的箭头按钮或名称区域会触发展开/折叠

#### 新建子目录功能：
1. 首先点击选中一个目录（顶级目录或子目录）
2. 点击导航器工具栏的"新建子目录"按钮
3. 子目录会创建在当前选中的目录下

#### 相关选择器：

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-entry__header` | 顶级目录头部行 |
| `.adl-browser-entry__header.is-selected` | 选中的顶级目录 |
| `.adl-filetree__item` | 子目录/文件项 |
| `.adl-filetree__item.is-selected` | 选中的子目录/文件 |
| `.adl-browser-entry__expand-btn` | 展开/折叠按钮 |

#### 自动化示例：

```javascript
// 点击顶级目录选中并展开
await page.click('.adl-browser-entry__header');

// 点击子目录选中并展开
await page.click('.adl-filetree__item');

// 点击"新建目录"按钮
await page.click('button[aria-label="新建目录"]');
```

---

## 浏览器内容

### 空标签引导页（Landing Page）

当没有活跃标签页或 URL 为 `about:blank` 时，显示空标签引导页。

#### 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-landing` | 引导页容器 |
| `.adl-browser-landing__content` | 内容区域 |
| `.adl-browser-landing__footer` | 底部工具栏 |

#### 快捷导航

| 选择器 | 说明 |
|--------|------|
| `.adl-shortcut-grid__items` | 网格容器 |
| `.adl-shortcut-card` | 快捷站点卡片（48×48px） |
| `.adl-shortcut-card__icon` | 图标槽（32×32 圆形） |
| `.adl-shortcut-card__icon .adl-browser-tree__favicon` | 网站图标（24×24，`border-radius: 4px`、`object-fit: contain`）；由共享站点元数据镜像供图，抓不到时才显示 `.adl-browser-tree__link-fallback` 名称首字母 |
| `.adl-shortcut-card--drag-over` | 拖拽悬停状态 |
| `.adl-shortcut-card__add-placeholder` | 虚线"+"占位卡片 |

> 新增快捷站点后先显示名称首字母，随后由 `ensureSiteFavicon` 自动补抓真实图标（会话节流、并发 2），
> 不需要手动刷新；等价于标签页的「刷新网站图标与标题」链路。实测（浏览器预览 5175，2026-11-19）：
> 图标槽与图标尺寸 `32×32` / `24×24`（`getBoundingClientRect`）；`getComputedStyle` 读到
> 图标槽 `border-radius: 50%`、`overflow: hidden`，图标 `border-radius: 4px`、`object-fit: contain`，
> 兜底首字母 `display: none`（图标已就绪时）。

```javascript
// 添加快捷站点（点击占位卡片或底部"管理快捷站点"）
await page.click('.adl-shortcut-card__add-placeholder');

// 通过对话框输入
await page.fill('.adl-prompt-modal__input:first-of-type', 'GitHub');
await page.fill('.adl-prompt-modal__input:nth-of-type(2)', 'https://github.com');
await page.click('button:has-text("添加")');

// 右键菜单：重命名 / 删除
await page.click('.adl-shortcut-card', { button: 'right' });
await page.click('.adl-sidebar-menu__item:has-text("重命名")');
```

#### 本地端口

| 选择器 | 说明 |
|--------|------|
| `.adl-local-port-section__items` | 端口卡片容器 |
| `.adl-local-port-card` | 端口卡片 |
| `.adl-local-port-card__add-placeholder` | 手动添加占位 |
| `.adl-local-port-section__refresh` | 刷新按钮 |

```javascript
// 手动添加端口
await page.click('.adl-local-port-card__add-placeholder');
await page.fill('.adl-prompt-modal__input:first-of-type', 'My App');
await page.fill('.adl-prompt-modal__input:nth-of-type(2)', '3000');
await page.click('button:has-text("添加")');

// 右键菜单：重命名 / 删除
await page.click('.adl-local-port-card', { button: 'right' });
await page.click('.adl-sidebar-menu__item:has-text("删除")');
```

#### 自定义背景（v2026-11-26 更新）

```javascript
// 打开背景设置对话框
await page.click('button:has-text("自定义背景")');

// 切换模式（默认 / 图片 / 视频）
await page.click('.adl-bg-settings__mode-btn:has-text("图片")');
await page.click('.adl-bg-settings__mode-btn:has-text("视频")');

// 选择文件（桌面端由系统对话框选取；也可把文件拖到虚线区）
await page.click('.adl-bg-settings__upload-zone');

// 填充模式（图片三档；视频只有铺满/适应）
await page.click('.adl-bg-settings__fill-btn:has-text("铺满")');

// 预览区拖拽平移 / 滚轮缩放 / 右上角复位
await page.click('.adl-bg-settings__preview-reset');

// 视频音量（自定义胶囊：图标 + S1 横向滑杆 + 百分比）
await page.click('.adl-bg-settings__volume-row .adl-bg-volume__toggle');

// 应用设置
await page.click('button:has-text("应用")');
```

| 选择器 | 说明 |
|--------|------|
| `.adl-bg-settings__upload-zone` | 上传虚线区（四角直角、固定最小高度；拖入/点击均可用） |
| `.adl-bg-settings__preview` | 预览裁剪容器（右上角复位图标；媒体只在该区域变换） |
| `.adl-bg-settings__preview-reset` | 复位图标按钮（无边框，悬停灰底，原生 `title="复位"`） |
| `.adl-bg-settings__mode-btn` / `.is-active` | 默认/图片/视频模式切换 |
| `.adl-bg-settings__fill-btn` / `.is-active` | 铺满/适应/平铺（视频无平铺）；切换会复位自由调整 |
| `.adl-bg-settings__volume-row` | 视频音量行（位于背景填充上方，标题与控件同一行） |
| `.adl-bg-volume` / `.adl-bg-volume__toggle` | 弹窗音量胶囊与圆形图标按钮 |
| `.adl-hslider` | S1 横向滑杆（`role="slider"`，支持拖拽/滚轮/方向键） |
| `.adl-volume-percent` / `.adl-volume-percent__input` | 百分比（双击输入，输入框 34×14、2px 圆角） |

> 背景文件无业务大小上限；桌面端复制到应用数据目录并由 asset 协议加载，浏览器端存 IndexedDB。
> 「重置」只清空草稿、不关闭弹窗；点「应用」才落库。

#### 着陆页视频音量（v2026-11-26 新增）

右下角音量控件：常态只显示圆形音量图标（无背景），悬停/聚焦向上展开胶囊（百分比 + 竖向 S1 滑杆），
图标悬停为 22px 圆形灰底。

| 选择器 | 说明 |
|--------|------|
| `.adl-landing-volume` | 容器（右下角） |
| `.adl-landing-volume__trigger` | 音量图标按钮（灰白色，亮暗主题一致） |
| `.adl-landing-volume__capsule` | 胶囊（常态 32×32 透明；悬停 44×170 玻璃底） |
| `.adl-landing-volume__percent` | 百分比（悬停有底色，双击输入） |
| `.adl-vslider` | S1 竖向滑杆（`role="slider"`） |

```javascript
// 悬停展开胶囊并调整音量
await page.hover('.adl-landing-volume');
await page.click('.adl-vslider');           // 点击轨道设置比例
await page.dblclick('.adl-landing-volume__percent'); // 双击百分比输入
```

#### 底部工具栏

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-landing__footer-btn` | 底部操作按钮（自定义背景 / 管理快捷站点） |

### WebView 生命周期（面板切换行为）

浏览器面板使用原生 Tauri WebView（桌面模式）或 `<iframe>`（浏览器模式）。面板切换时的 WebView 行为如下：

| 动作 | Tauri 桌面模式 | 浏览器预览模式 |
|------|---------------|---------------|
| 切换到其他面板 | WebView 被移动到离屏位置 `(32767, 32767)` 且缩小为 1×1 | iframe 随父容器 `display: none` 隐藏 |
| 切回浏览器面板 | WebView 重新定位到内容区，**页面不刷新，状态保持** | iframe 恢复显示，**页面不刷新** |
| 收起右侧面板 | WebView 离屏隐藏（同上） | iframe 隐藏（同上） |
| 展开右侧面板 | WebView 重新定位到内容区 | iframe 恢复显示 |
| 切换标签页（v2026-06-23 新增） | 单 WebView 导航到新 URL（页面重新加载） | 多 iframe 堆叠：每个已查看标签的 iframe 保持挂载（隐藏状态），仅切换可见性；**页面不刷新，状态保持** |
| 浮动元素打开（对话框/菜单等） | WebView 被瞬移到离屏位置 `(-10000,-10000)`，**菜单/对话框正常显示**，关闭后恢复 | iframe 不受影响（HTML 层叠上下文） |
| 鼠标悬停/拖拽右侧面板左边缘 | WebView 保持可见，resize handle 已左扩 8px 进入中心躲避 WebView，**拖拽线可正常操作**；有对话框/菜单时原生桥接条自动隐藏 | 不受影响；拖拽线容器不吃指针事件，仅 3px 线可命中，z-index 为 `var(--z-raised)` (10)（低于弹层遮罩，不再穿透悬浮层） |

### 定位选择器

| 模式 | 选择器 | 说明 |
|------|--------|------|
| Tauri 桌面 | `webview[label="adl-browser-view"]` | 系统 WebView 元素 |
| 浏览器预览 | `.adl-browser-iframe` | iframe 元素 |

### 外部浏览器打开按钮

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-external-btn` | 浏览器预览模式下使用，在新标签页打开当前 URL |

### iframe 错误提示（v2026-06-17 新增）

当 URL 被 `X-Frame-Options` 或 `CSP frame-ancestors` 阻止，或连接失败时，显示统一错误容器：

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-error-container--active` | 错误提示容器（仅在加载失败时出现） |
| `.adl-browser-error__icon` | 警告三角图标（IconAlertTriangle, 28px） |
| `.adl-browser-error-text` | 错误说明文字 |
| `.adl-browser-external-btn--prominent` | 错误容器内的"在外部浏览器打开"按钮 |

两个错误类型共享同一容器：
- **嵌入被阻止**：`browserCannotOpenEmbedded` — "This site cannot be displayed in the embedded view. Try opening it in an external browser."
- **连接失败**：`browserConnectionFailed` — "Unable to connect to the site. Please check the URL or try opening it in an external browser."

错误容器 **仅在** `iframeLoadError` 为 `true` 时渲染，不会常驻显示。

---

### 历史记录滚动条

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 浏览器面板 | `.adl-tool-panel--browser` | 浏览器面板容器 |
| 地址栏 | `.adl-tool-search--address` | 可折叠展开的地址搜索栏 |
| 内容区 | `.adl-tool-primary--browser` | 浏览器内容容器 |
| 外部浏览器按钮 | `.adl-browser-external-btn` | 浏览器模式浮动降级按钮 |
| 历史记录滚动条 | `.adl-multitree-scrollbar` | 自定义滚动条，位于左侧 |
| 滚动条滑块 | `.adl-multitree-scrollbar__thumb` | 滚动条滑块元素 |
