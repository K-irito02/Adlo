# 预览链接交互 + 「打开方式」设置组设计

> **日期：** 2026-10-18
> **状态：** 待评审（brainstorming，架构级）
> **范围：** ①右侧面板文件/变更面板 Markdown 预览正文中的章节导航 / 文件索引 / 网址链接可点击；②设置面板新增「打开方式」设置组（网址链接落点 / 文件打开方式 / 智能体站点链接拦截 + 白名单）
> **关联约束：** 所有落点由「打开方式」设置组单一真源决定；不新增硬编码展示文本（i18n）；双端一致（能力差异见 §10）

---

## 1. 问题陈述与需求

### 1.1 用户需求（原文归纳）

1. 右侧面板-文件面板 / 变更面板，在「文件预览」模式下打开 `.md` 文件时，正文里的「章节导航、文件索引、网址链接」等点击**无任何反应**。期望：
   - 点击「章节导航」（正文内锚点链接）→ 跳转到该文件对应章节。
   - 点击「文件索引」（指向文件的链接）→ 打开显示对应文件。
   - 点击「网址链接」→ 在浏览器打开，且**不受**「在当前标签页打开链接 / 在新标签页打开链接」双态按钮影响（始终新建标签，见 §2 澄清）。
2. 设置面板新增「打开方式」设置组：
   - 网址链接打开方式：中心 / 右侧浏览器面板 / 外部浏览器（系统默认应用）三选一，**统一**管理所有相关入口的网址链接落点。
   - 智能体站点正文中 agent 输出的「网址链接、文件」打开方式的**拦截**开关（启用 / 关闭）：启用时按本项目落点打开；关闭时保持站点自身行为。
   - 拦截白名单：支持用户添加 dsh 以外的其它智能体网址（**dsh 不内置**，需用户自行添加）；设置项需带**填写示例**。
   - 文件打开方式：右侧文件面板 / 系统默认应用二选一。

### 1.2 澄清结论（已与用户确认）

| 议题 | 结论 |
|---|---|
| 链接类型 | 均指 Markdown **正文内超链接**；右侧大纲导航面板（按行号跳转）已可用，不在本次范围 |
| 网址链接落点 | 由「打开方式」设置**统一决定**，作用于入口 ①Markdown 预览链接、②智能体站点拦截链接；③浏览器嵌入失败兜底页的「外部打开」按钮**不**消费该设置（保持固定外部语义） |
| 「始终新建标签」语义 | 指**绕过**就地/新建标签双态开关，而非固定右面板；落点仍由设置决定（默认右面板） |
| 拦截开关默认值 | **关闭**（opt-in，不改变现有行为） |
| 白名单 | **dsh 不内置**；用户手工填写；**整站匹配**（origin：`scheme://host:port`） |
| 拦截作用面（浏览器模式） | 跨域 iframe 无法注入 → **置灰 + 说明「仅桌面模式可用」** |
| 默认值 | 网址 = 右侧浏览器面板；文件 = 右侧文件面板 |

---

## 2. 现状盘点（已核实，非推测）

### 2.1 Markdown 预览（无点击拦截层）

- 渲染：`frontend/src/app/features/preview/MarkdownPreview.tsx` —— 单个 `dangerouslySetInnerHTML`，容器 `.adl-markdown-preview`，**无 `onClick`、无事件委托、无 `closest('a')`**。
- 解析：`frontend/src/app/features/preview/markdownPreviewUtils.ts`（markdown-it，`html:false`、`linkify:true`）。标题 `heading_open` 规则仅设 `data-source-line` 与 `id="adl-heading-{行号}"`（`utils:56`）——**正文 `[x](#foo)` 锚点永远命中不了**。
- 挂载点：文件面板 `frontend/src/app/regions/right-panel/FilePreviewRenderers.tsx:221`；变更面板 `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx:357`；剪贴板历史 `frontend/src/app/features/clipboard-history/ClipboardItemViewer.tsx`。
- 后果：点击任意链接 → 落回宿主 WebView 默认导航（相对/外部链接会让应用主 WebView 导航走）。

### 2.2 浏览器标签打开机制

- `browserOpenTab(url?, title?, wsId?, folderId?)`（`frontend/src/app/stores/slices/browserTabsSlice.ts:56`）新建标签，`location` 缺省 → 面板标签（`isPanelTab` 于 `slices/tabLocation.ts`）。
- 「中心打开」= `browserOpenTab` + `centerShowBrowserTab`（`frontend/src/app/stores/actions/centerActions.ts:20`；封装见 `useOpenInCenterAction.ts:17`）。
- 「右侧面板打开」= `browserOpenTab`（新建面板标签）。
- 外部：`window.digitalLife.window.openExternal(url)`（`shared/ipc/window.ts:75`；Tauri 走 `@tauri-apps/plugin-shell` `open()`，浏览器走 `window.open`）。
- 「就地/新建标签」双态开关：`browserNavigateInPlace`（`useBrowserPanelHandlers.ts:44-83`）。本次设置路径**绕过**该开关，始终新建标签。

### 2.3 智能体站点（dsh）宿主与注入拦截栈

- dsh 是**普通浏览器标签**（`location='center'`，URL 形如 `http://127.0.0.1:3080`）。
- Tauri：每个标签一个 WebView2，创建时注入 `crates/browser/src/init_script.js`（`src-tauri/src/commands/browser_webview_setup.rs:210`，`init_script_with_background`）。
- 现有拦截（`init_script.js`）：锚点点击委托（190-291，普通点击 `preventDefault` + SPA 导航守卫就地打开；Ctrl/中键/`target=_blank` → postMessage `open-new-tab`）、`window.open` 重写（293-345）、`location.assign/replace`（352-383）、表单提交（395-427）；Rust 侧 `new_window_handler`（`browser_webview_setup.rs:93`）对新窗口一律 `Deny` 并 emit `browser-open-new-tab`；`webview2_postmessage.rs` 解析 postMessage。
- 前端订阅：`useBrowserNewTabSubscription.ts`（`onOpenNewTab`）。
- 浏览器模式：dsh 以 `SafeIframe`（跨域 `127.0.0.1:3080`）嵌入 → **无法注入脚本，拦截不可行**。

### 2.4 设置系统

- 组真源：`frontend/src/app/components/settings/settingsGroups.ts`（`SETTINGS_GROUPS`）、类型 `SettingsGroupId`/`SettingItem`（`frontend/src/kernel/types.ts:436`）。
- 组组件映射：`SettingsPanel.tsx` `SETTINGS_COMPONENTS`（`shortcuts/workspace/browser/dsh/storage` 为自定义组件；其余走通用 `SettingsControls`）。
- 偏好持久化：`AppPreferencePatch`（Rust `crates/types/src/types/config.rs:143`，TS `frontend/src/shared/ipc-types.generated.ts:58`）→ `crates/kernel/src/config.rs`（`apply_patch`）→ `ConfigSnapshot`（读）；前端 `preferencesMerger.ts`、`defaultPreferences.ts`；写入口 `generalActions.updatePreferences`。先例：`browserInactiveTabSuspendMs`。
- 组级重置：`GROUP_RESET_PATCHES` / `RESETTABLE_GROUPS`（`settingsGroups.ts`）。
- i18n：`frontend/src/app/i18n/zh-CN/settings.ts`（+ `en-US/`），`CopyKey` 以 zh-CN 为真源。

---

## 3. 目标与非目标

### 3.1 目标
- Markdown 预览正文：锚点跳章节、文件链接开文件、网址链接按设置打开；不再让链接触发宿主 WebView 导航。
- 新增「打开方式」设置组，作为网址/文件落点的单一真源，含智能体站点链接拦截开关与白名单。
- Tauri 下拦截白名单内智能体站点的正文链接与本地文件链接，按设置路由。

### 3.2 非目标
- 右侧大纲导航面板（已可用）。
- 书签/历史/快捷站点等「直接导航」入口（非「点链接」）。
- 浏览器嵌入失败兜底页的「外部打开」按钮（固定外部语义不变）。
- 浏览器模式下的智能体链接拦截（技术不可行，见 §10）。
- 打开 dsh 服务器端附件/blob 到文件面板（仅本地文件，见 §8.3）。

---

## 4. 总体架构

三层，单一真源：

```
设置层（AppPreferencePatch / ConfigSnapshot）
  linkOpenMethod         middle | panel | external     默认 panel
  fileOpenMethod         panel  | external             默认 panel
  agentLinkIntercept     bool                          默认 false
  agentSiteWhitelist     string[]（origin）             默认 []
        │
        ├──────────────► 打开执行层（前端共享模块）
        │                   openUrlByMethod(url)   → middle/panel/external
        │                   openFileByMethod(path)  → panel/external
        │
链接识别层
  ① Markdown 预览（应用主 WebView DOM）：容器 onClick 事件委托
  ② 智能体站点（Tauri WebView2）：init_script 注入分支 → postMessage → Rust 事件 → 前端
```

两个入口都调用同一对打开动作 → 满足「统一设置所有地方」。

---

## 5. 设置层设计

### 5.1 数据模型（Rust + TS 双端）

新增枚举（`crates/types/src/types/config.rs`，`#[serde(rename_all = "lowercase")]` + `TS`）：

```rust
pub enum LinkOpenMethod { Middle, Panel, External }   // middle|panel|external
pub enum FileOpenMethod { Panel, External }            // panel|external
```

`AppPreferencePatch` 增（`#[ts(optional)]`，snake_case 字段 / 线格式 camelCase）：

```rust
pub link_open_method: Option<LinkOpenMethod>,
pub file_open_method: Option<FileOpenMethod>,
pub agent_link_intercept: Option<bool>,
pub agent_site_whitelist: Option<Vec<String>>,
```

`ConfigSnapshot` 增（带产品默认，`#[serde(default = ...)]`）：

```rust
pub link_open_method: LinkOpenMethod,   // 默认 Panel
pub file_open_method: FileOpenMethod,   // 默认 Panel
pub agent_link_intercept: bool,         // 默认 false
pub agent_site_whitelist: Vec<String>,  // 默认 []
```

同步：`crates/kernel/src/config.rs`（config 结构体 + `apply_patch` + `Default`/`load` 默认）、`crates/kernel/src/app_info.rs`（快照映射）、`crates/server/src/handlers/app.rs`（偏好相关分支，如有 `is_browser_related` 之类名单需评估）、`crates/types/src/types/mod.rs`（测试默认）、`frontend/src/shared/ipc-types.generated.ts`（手工同步）、`frontend/src/shared/preferencesMerger.ts`、`frontend/src/shared/defaultPreferences.ts`。

### 5.2 白名单校验（origin 归一）

- 输入按行解析为 origin；校验为 `scheme://host[:port]`（http/https）。非法行给出内联提示（i18n）。
- 归一：解析 `new URL(line).origin`；去重；剔除空行。便于整站匹配。
- Rust 侧同样做防御性归一/校验（非法值返回结构化错误），前端即时反馈。

### 5.3 UI：自定义组组件 `OpenMethodSettings.tsx`

- 新组 `SettingsGroupId: 'openMethod'`，`SETTINGS_GROUPS` 增加 `{ id: 'openMethod', labelKey: 'settingsOpenMethod' }`（排在「浏览器」组之后、「DSH」之前）。
- 注册到 `SETTINGS_COMPONENTS.openMethod`（自定义组件，遵循 `BrowserSettings`/`DshSettings` 先例；便于承载白名单编辑器）。
- 组内四项：
  - 网址链接打开方式（select：中心 / 右侧浏览器面板 / 外部浏览器）
  - 文件打开方式（select：右侧文件面板 / 系统默认应用）
  - 智能体站点链接拦截（toggle；浏览器模式 disabled + 说明）
  - 智能体网址白名单（**列表编辑器**：逐行输入；占位/描述含**示例**，如 `http://127.0.0.1:3080`、`https://my-agent.example.com`；说明「整站匹配，填 origin，不要带路径」）
- 读：`appInfo.config.*`；写：`actions.updatePreferences(patch)`。
- 搜索锚点：按组件先例注册（`settingsSearchAnchors`）。
- 重置：`GROUP_RESET_PATCHES.openMethod = () => ({ linkOpenMethod:'panel', fileOpenMethod:'panel', agentLinkIntercept:false, agentSiteWhitelist:[] })`，并加入 `RESETTABLE_GROUPS`。
- i18n 新增约 12 个 key（组名、三项 label/description、白名单 label/description/占位/示例/校验提示、浏览器模式不可用说明、选项文案）；中英同步。

---

## 6. 打开执行层（前端共享模块）

新增 `frontend/src/app/features/browser/openByMethod.ts`（或等价 store action）：

```ts
openUrlByMethod(url: string): void
  // middle   → browserOpenTab(url) + centerShowBrowserTab(activeId)
  // panel    → browserOpenTab(url)            （新建面板标签，绕过就地面板双态开关）
  // external → window.digitalLife.window.openExternal(url)

openFileByMethod(absPath: string): void
  // panel    → 现有文件打开链（选中路径 + 载入文件面板）；工作区外/不可读 → 降级 openExternal 或提示
  // external → window.digitalLife.window.openExternal(absPath)（系统默认应用）
```

- 落点读 `useAppStore.getState()` 的 config（或经 selector）。
- 复用现有打开链，不新增重复逻辑；`external` 复用 `openExternal`（双端已实现）。

---

## 7. Markdown 预览链接（需求 1）

### 7.1 事件委托

在 `MarkdownPreview.tsx` 容器加单个 `onClick`（React 委托）：`closest('a')` 命中后按 href 分类并 `preventDefault`。

### 7.2 章节导航（1a）

- **根因修复**：`markdownPreviewUtils.ts` 的 `heading_open` 规则生成 GitHub 风格 slug（小写、空白→`-`、去标点、保留 CJK，重复标题追加 `-1/-2`）并**作为标题元素的 `id`**（替换现有 `id="adl-heading-{line}"`）。已核实 `adl-heading-{line}` 仅被该文件自身与 `MarkdownPreview.test.ts` 引用（`revealSourceLine` 走 `data-source-line-start`，不依赖该 id），故可安全替换；同步更新 `MarkdownPreview.test.ts` 断言。`data-source-line` 保留不动。
- 点击 `#slug` → 在预览滚动容器内 `scrollIntoView`（`CSS.escape` 处理 id）；slug 未命中 → 回退按标题文字匹配。

### 7.3 文件索引（1b）

- href 非 http/https（相对/绝对本地路径）→ 相对**当前 md 文件所在目录**解析 → 限**工作区内** → `openFileByMethod`。
- 工作区外或无法解析 → `openExternal` 或提示（i18n）。
- 需要文件上下文（当前文件路径 + 工作区根）→ `MarkdownPreview` 新增可选 props（如 `linkContext`/回调），由 `FilePreviewRenderers` / `DiffEditorSection` 注入；剪贴板历史无上下文 → 降级 `openExternal`。

### 7.4 网址链接（1c）

- href http/https → `openUrlByMethod(url)`（落点由设置决定，绕过面板双态开关）。
- 其它 scheme（`mailto:` 等）→ `openExternal`。
- 无文件上下文时（剪贴板历史）网址链接同样 `openUrlByMethod`（不依赖文件上下文）。

---

## 8. 智能体站点拦截（需求 2，仅 Tauri）

### 8.1 agent 来源集

- **仅白名单**（dsh 不内置）。匹配按 origin 整站：`location.origin ∈ whitelist`。

### 8.2 注入与刷新

- WebView 创建时把当前 `whitelist` 与 `agentLinkIntercept` 烘焙进 `init_script`（`init_script_with_background` 扩展参数）。
- 设置变更 → 新命令 `browser_set_agent_intercept(origins: Vec<String>, enabled: bool)`（`#[tauri::command]`，登记 `capabilities/*.json`）向所有浏览器 WebView `eval` 同一段 JS：`window.__adlAgentOrigins=[...]; window.__adlAgentInterceptEnabled=<bool>`。注入脚本点击逻辑在**点击时读取**这两个全局，实现运行期生效。

### 8.3 注入脚本分支（`init_script.js`）

`isAgentHost && enabled` 时：
- http(s) 锚点点击 → `preventDefault` + postMessage `{type:'adl-agent-link', kind:'url', url}`。
- **本地文件**锚点：`file://` scheme → `{kind:'file', path}`。**分类保守**（仅 `file://` 视为文件；其余 http(s) 视为 url；其它 scheme 视为 url/外部）。
- `window.open`：同样的 agent 分支（否则 deleg 到原逻辑）。
- 下载链接（blob / download 扩展）→ **保持现有原生管线不动**。
- 关闭或非 agent 站点 → 现有行为完全不变。

> **实证未知项（实施期必做）**：dsh/智能体正文实际以何种 DOM/JS 输出「网址链接、文件」需以调试日志实测确认（禁止凭空假设）。若为自定义 JS（React onClick + 站内 router），需在同一注入脚本内补充对应拦截点；若为 http 下载型「文件」链接，则超出「本地文件」范围（§2.3 / §8.4，按 url 处理并在文档说明）。

### 8.4 Rust 转发与前端消费

- `crates/browser/src/webview2_postmessage.rs` 增解析 `adl-agent-link`（含 origin 校验，仅接受白名单来源）→ 经事件桥 emit `digital-life://browser-agent-link {tabId, kind, url|path}`。
- 前端新增订阅（Tauri only）：`kind:'url'` → `openUrlByMethod`；`kind:'file'` → 解析本地路径 → `openFileByMethod`。
- **仅本地文件**：`file` 目标必须是本地绝对路径且可解析；不在工作区内 → `openFileByMethod` 的 external/提示降级。

---

## 9. 双端一致性

| 能力 | Tauri 桌面 | 浏览器模式 |
|---|---|---|
| Markdown 预览链接（1a/1b/1c） | ✅ | ✅（DOM 在应用 WebView 内，同一实现） |
| 网址/文件打开方式设置 | ✅ | ✅（同一 store/config） |
| 智能体站点链接拦截 | ✅（WebView2 注入） | ❌ 置灰 + 说明「仅桌面模式可用」 |

拦截开关在浏览器模式下的不可用属**技术不可行**（跨域 iframe），非实现偷懒；按用户决定以「置灰 + 说明」呈现，满足可发现性与诚实性。

---

## 10. 不变量

- 所有「打开方式」落点只经 `openUrlByMethod` / `openFileByMethod`，不得各处散落直调 `browserOpenTab`/`openExternal`。
- 任何 UI 展示文本走 i18n，不得硬编码。
- 拦截未启用 / 非白名单站点时，现有浏览与下载行为**零变化**。
- `file` 拦截仅限本地文件；不触碰 dsh 服务器附件（保持原生下载）。
- 白名单与拦截为纯本地偏好，不写入日志敏感面。

---

## 11. 测试策略

- 前端单测：`openUrlByMethod`/`openFileByMethod` 三分支；Markdown 链接分类 + slug 生成（`MarkdownPreview.test`）；文件链接解析（相对/工作区内外）；`OpenMethodSettings` 渲染与写回；`settingsViewModel`/`defaultPreferences`/`preferencesMerger` 新字段；白名单 origin 校验。
- 注入脚本：`frontend/src/app/features/browser/initScriptNavigation.test.ts` 增 agent-host 分支（url/file/关闭/非白名单）。
- Rust：`webview2_postmessage` 解析 `adl-agent-link`（含 origin 白名单校验）单测；config serde 默认值 + `apply_patch`；clippy `--workspace --all-targets` 0 警告。
- 分级执行（受影响范围）；收尾按需全量。

---

## 12. 风险与开放项

1. **智能体链接 DOM 形态未知** → 实施期先实测（§8.3），再定最终拦截点。
2. **「文件」识别** 为启发式，保守取 `file://`；若实测 dsh 用其它形式，需在实测后扩展并在文档补记。
3. **运行期白名单刷新** 依赖 `eval` 到既有 WebView；失败 fail-open（保持现状）并留痕。
4. **Windows 路径** 与 `file://` → 本地路径的转换需处理盘符/百分号编码。
5. **文件面板打开链** 复用需验证「工作区内绝对路径 → 选中并载入」链路可被外部调用（可能需要新的 action 或复用 `openFileGeneric`）。
