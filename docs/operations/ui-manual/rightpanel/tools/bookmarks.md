# 书签导入 / 导出对话框

> 书签文件的导入与导出对话框（浏览器面板「书签目录」区域菜单触发：⋮ → 导入书签 / 导出书签）。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-prompt-modal` | 对话框遮罩层 |
| `.adl-prompt-modal__panel[role="dialog"]` | 对话框面板（导入固定 600px 高） |
| `[aria-label="导入书签"]` / `[aria-label="导出书签"]` | 两个对话框 |

## 头部（两个对话框通用设计）

| 选择器 | 说明 |
|--------|------|
| `button[aria-label="导入书签说明"]` / `button[aria-label="导出书签说明"]` | 左上角问号型提示按钮，hover/click 打开 HintCard（文案按步骤/对话框分别定制） |
| `span[style*="font-weight: 600"]` | 标题（导入书签 / 导出书签） |
| `.adl-prompt-modal__header-close` | 右上角关闭按钮（aria-label="关闭"） |

## 导入书签对话框（两步）

### 第 1 步「选择内容」

| 选择器 | 说明 |
|--------|------|
| `[role="tablist"]` | 步骤分段控制器（选择内容 / 导入目标） |
| `[role="tree"]` | 勾选树容器（空目录不显示） |
| `.adl-search-ignore__row` | 树行 |
| `[role="checkbox"]` | 行内复选框（自定义 checkbox，aria-checked） |
| `[role="option"]` 的行点击 | 展开/折叠目录 |
| `[aria-label="全选"]` / `[aria-label="清空选择"]` | 工具栏图标按钮 |
| `[aria-label="全部展开"]` / `[aria-label="全部折叠"]` | 展开折叠双态工具栏按钮（aria-pressed 随状态切换） |
| `[role="separator"][aria-orientation="vertical"]` | 左右分隔线（aria-label="拖动调整两栏宽度"） |
| `.adl-bookmark-picklist` | 右栏「将导入 (N)」条目列表 |
| `button.adl-btn--primary` | 底部「下一步」（无选中项时禁用） |

### 第 2 步「导入目标」

| 选择器 | 说明 |
|--------|------|
| `[role="radiogroup"][aria-label="导入方式"]` | 左侧模式导航（原目录结构导入 / 新建顶层目录导入 / 选择已有目录导入） |
| `[role="radio"]` | 三个模式单选项（选中态边框 var(--border-strong) + 底 var(--bg-active)） |
| `#newDirName` | 新建顶层目录面板的名称输入框（`.adl-prompt-modal__input`；同名顶层目录冲突时变 `--error` 态） |
| `button` 文本=「新建目录」 | 选择已有目录面板的内联按钮，融入「…请点击 [新建目录]」提示句中 |
| `input[placeholder*="嵌套目录名称"]` | 嵌套子目录输入框（Enter 创建 / Esc 取消） |
| `.adl-target-tree__row` | 已有目录树的行（整行点击 = 展开/折叠 + 选中） |
| `.is-selected`（`.adl-target-tree__row` 上） | 选中态（背景 var(--bg-active) + 左侧 var(--border-strong)） |
| `button.adl-btn--primary`（文本=导入） | 确认导入按钮（禁用条件：keptCount=0 或目标构建失败） |

### 行为要点

- 空目录（无任何书签）不显示在树中；导入时同样不创建。
- 重复项一律跳过（文件内同名顶层目录与自建目录同名则合并）。
- 松散顶层书签归入自动创建的「顶层书签」（仅文件确有顶层书签时创建）。
- 新建嵌套子目录延迟到导入确认时创建（parent 为选中的树行，workspace 或 user folder）。

## 导出书签对话框

| 选择器 | 说明 |
|--------|------|
| `[aria-label="全选"]` / `[aria-label="清空选择"]` | 工具栏图标按钮 |
| `[aria-label="全部展开"]` / `[aria-label="全部折叠"]` | 展开折叠双态工具栏按钮（aria-pressed 随状态切换） |
| `.adl-search-ignore__row` + `[role="checkbox"]` | 勾选树（工作区目录 / 自建目录两段；空目录与空分类不显示） |
| `[role="separator"][aria-orientation="vertical"]` | 左右分隔线 |
| `.adl-bookmark-picklist` | 右栏「将导出 (N)」条目列表（整分类勾选则以分类名为条目） |
| `button.adl-btn--primary`（文本=导出为 HTML） | 确认导出按钮 |

### 行为要点

- 目录默认全部展开。
- 勾选「自建目录」分类行 → 右栏显示一条「自建目录（N）」汇总条目。
- 显示框内导出为 .html 书签文件（不导出 about:/file:/javascript: 链接）。

## 等待条件

- 导入/导出执行前以 `document.querySelector('[role="dialog"]')` 判定对话框打开。
- 两个对话框的"取消/返回"关闭后 `document.querySelector('.adl-prompt-modal')` 应消失。
- 文件选择器弹出由系统/WebView2 负责，无 DOM 可等。

## 自动化 / 调试备忘（2026-11-10 实录）

以下两个坑各自烧掉过一轮会话时间，留档给下一次：

### 1. dev preview 重载后浏览器面板可能挂载不完整（tab 列表为空）

- **现象**：`「浏览器」` tab 存在，但 `settings`/`browser` 面板可能只剩空态，`更多操作` 菜单里「导入书签 / 导出书签」条目可能找不到。
- **特征**：刷新页面后空态可见（bodyLen < 600），左侧「书签目录」显示 0 项；console 只有 CORS/代理噪音（`storage/*`），无 JS 报错。
- **可靠做法**：重载后按 `document.querySelector('.adl-toolswitcher__tab[aria-label="浏览器"]')?.click()` 显式切到浏览器 tab，再等 5–15 秒、轮询 `更多操作` 按钮可见后再点；若 console 报 CORS `Failed to fetch`，说明 dev preview 的 Node 后端没起（数据 / 工作区不恢复），**此时播种任何 `localStorage` 不会被 Tauri 端读（那是 Tauri 的存储）**——仅用于 dev preview 内自身的功能验证。

### 2. 「菜单 → 导入书签 → 选文件」必须在同一个 evaluate 里完成

- **现象**：菜单 `「导入书签」` 触发 `startBookmarkImportPick()` 创建隐藏 `input[type="file"]` 并 `.click()`；CDP evaluate 里访问 `document.querySelector('input[type=file]')` 发现节点存在，但同一 call 里再做文件注入、`DataTransfer` 派发 `change` 时节点消失（React effect 清理了）。
- **可靠配方**：
  ```js
  // 必须在同一 evaluate 内完成（先点菜单确认 input 存在，立即注入）
  const resp = await fetch('http://127.0.0.1:5199/favorites_2026_11_9.html');
  const html = await resp.text();
  const input = document.querySelector('input[type=file]');
  const file = new File([html], 'favorites_2026_11_9.html', { type: 'text/html' });
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  ```
- **等待**：`下一步` 按钮可见即 step 1 已就绪；点击 `下一步` 后等 `text:导入方式` 出现再切换导入模式。
- **dev preview 与真实 Tauri 的差异**：dev preview 的持久层走 node dev-server（CORS 经常失败），`localStorage` 播种仅影响 preview 实例自身；真正导入的书签不会持久化到 Tauri 端。想看持久化效果，必须走真实应用或 `pnpm dev:tauri`。

### 3. 亮暗主题 getComputedStyle 需直接切换 `data-theme`

- 真实验证暗色 token 时直接切 `document.documentElement.setAttribute('data-theme', 'dark'|'light')`，比启动两套 dev server 快；切完再读 `getComputedStyle` 断言。
- 注意：CSS 进度文件里已是双主题 getComputedStyle 实测值，不要重新手写、与入口对不上。

### 4. 等待条件推荐顺序

1. 对话框开着 → `document.querySelector('.adl-prompt-modal__panel[role="dialog"]')` 存在
2. 步骤切换 → 等 `text:下一步` / `text:导入方式`（与 dialog 内容匹配的文案都行）
3. 面板里 data-rich 时再 ready → 再点按钮，不要硬 `waitForSelector` 猜类名
