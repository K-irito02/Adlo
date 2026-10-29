# 设置工具面板

> 应用设置面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#settings-panel` | 设置面板容器 |
| `.adl-settings-panel` | 设置面板根（键盘快捷键 `mod+F` 的作用域宿主） |
| `.adl-settings-panel__header` | 首行工具栏（导航折叠 / 搜索 / 恢复全部默认） |
| `.adl-settings-panel__body` | 正文（导航 + 内容区） |

---

## 设置导航

> 左侧导航栏，用于切换设置组。**搜索态下仍保持可见**（跳转式搜索需要它）。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-settings-nav` |

### 设置组

| 组ID | 名称 | 说明 |
|------|------|------|
| `general` | 通用 | 语言、主题、日志级别、字体等通用设置 |
| `workspace` | 工作区 | 并行加载数、优先级/延后列表 |
| `storage` | 存储 | 核心数据路径、树缓存、终端预算、浏览器下载路径、不可移动项 |
| `shortcuts` | 快捷键 | 键盘快捷键配置 |
| `browser` | 浏览器 | 挂起时长、下载模式、下载路径 |
| `openMethod` | 打开方式 | 网址/文件默认打开落点 + 智能体站点链接拦截与白名单 |
| `dsh` | DSH | 版本管理（下载源 / 代理设置已迁入「网络」组） |

> 组顺序与标签的单一真源为 `frontend/src/app/components/settings/settingsGroups.ts` 的 `SETTINGS_GROUPS`。

### 组级恢复默认

导航每行（`RESETTABLE_GROUPS` 内的组）带「恢复该组默认」按钮。全组已为默认值时该按钮禁用。

- `general` / `workspace` / `shortcuts`：走偏好 patch，弹出通用确认框
- `storage` / `browser` / `dsh`：切到该组并置「待处理」信号，由该组组件弹出自有确认框并执行多步流程

---

## 搜索设置

> 首行工具栏左侧。跨**全部 7 个组**检索设置项；结果按组分组，点击跳转到该设置项。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-settings-panel__search` |
| 2 | CSS | `.adl-settings-panel__search-input`（展开后的输入框，`id="adl-settings-search-input"`） |
| 3 | CSS | `.adl-settings-search-results`（结果列表） |

### 锚点约定

每个可搜索项在 DOM 上带 `data-settings-anchor="<组ID>:<锚点ID>"`，字符串由
`frontend/src/app/components/settings/settingsSearchIndex.ts` 的 `anchorFor(group, anchorId)` 单点生成，
索引条目与实际挂载点必须一一对应（由 `settingsSearchAnchors.test.tsx` 的「锚点必存在」用例锁定）。

命中后由**共享落点高亮**提示：内容宿主内常驻覆盖层 `.adl-reveal-highlight`（视口夹层
`.adl-reveal-highlight-viewport` 裁剪溢出）播放 1.4 秒淡出动画，本面板带主题蓝变体类
`adl-reveal-highlight--accent`（文件面板检索→预览用 `--warning`，同一实现两套配色，
见 `frontend/src/app/utils/revealHighlight.ts`、`frontend/src/app/components/RevealHighlight.tsx`）。

落点元素：命中块主标题时落在块锚点容器；命中**块内某行的副标题/提示说明**时落在那一行
（行容器带 `data-settings-row="<该行主文案>"`，取值与索引 `SettingsSearchDetail.locate` 同源同 key；
取不到该行时回退块锚点，见 `settingsRowLocate.ts`）。

### 操作流程

```javascript
// 方式一：点搜索图标
await page.click('[aria-label="搜索设置"]');

// 方式二：键盘快捷键（焦点须在设置面板内；面板外不响应）
await page.focus('.adl-settings-panel');
await page.keyboard.press('Control+f');   // macOS: Meta+f

// 输入查询（跨组命中；快捷键组还可按快捷键文本检索）
await page.fill('#adl-settings-search-input', 'tree');

// 点击某条结果 → 收起搜索、切到该组、滚动到落点并短暂高亮
await page.click('.adl-settings-search-results >> text=工作区树缓存');

// 断言落点（跳转后）：命中块内行文案时落在那一行，否则落在块锚点
await page.waitForSelector('.adl-reveal-highlight.is-active.adl-reveal-highlight--accent');
await page.waitForSelector('[data-settings-row="<该行主文案>"], [data-settings-anchor="storage:treeCache"]');

// 注意：`.is-active` 是 1.4 秒瞬态类 —— 该断言须紧跟点击执行（慢 CI / 人工逐步执行时
// 动画可能已结束）。只验证接线时可改为断言常驻的 `.adl-reveal-highlight--accent`
// 与 `.adl-reveal-highlight-viewport`。

// 无命中时显示既有空态键 settingsNoResults（「无匹配设置项」/「No matching settings」）
```

> 跳转需等待异步挂载的锚点（如 `storage:treeCache` 在树缓存统计回包后才渲染），实现为**有界**逐帧重试（约 2 秒上限）。

---

## 恢复全部默认

> 首行工具栏右侧。聚合**全部四个执行单元**：偏好（通用 + 工作区 + 快捷键）→ 浏览器 → DSH → 存储。
> 存储排在**最后**，因为其核心路径恢复可能触发文件迁移与应用重启。

全组已为默认值时按钮禁用。

### 定位选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-settings-panel__header-actions button` | 「恢复全部默认」按钮 |
| `.adl-confirm-overlay` / `.adl-confirm-dialog` | 聚合确认框（`createPortal`，样式类与组级对话框共用） |

### 聚合确认框内容

> 点击按钮后先后台算好存储计划再弹框（框内无“计算中”态；在途按钮禁用 + `aria-busy`）。
> 确认框不列分组清单，仅保留决策项。

| 区域 | 说明 |
|------|------|
| 确认说明 | 通用文案「所有设置将恢复为默认值，此操作不可撤销。」 |
| 预检汇总 | 核心路径需迁移时显示文件数与体积、errors/warnings；**预检有 error 时两个确认键均禁用** |
| 保留源 | `t.storageRetainSource` 复选框，**默认不勾选**（迁移后删除旧路径数据）；预检阻塞时同步禁用 |
| 确认键 | 核心需恢复 → 双键「下次启动时迁移」/「立即迁移并重启」；无需恢复 → 单键 |
| 进度 | 执行中逐组显示「正在恢复：<组名>」（恒占位，无布局跳动）；**执行期禁用关闭/取消/遮罩/Escape**（迁移不可中断） |

### 操作流程

```javascript
// 打开聚合确认框（计划预计算完成后才出现，直接等待对话框即可，无框内加载态）
await page.click('.adl-settings-panel__header-actions button');
await page.waitForSelector('.adl-confirm-dialog');

// 确认键：核心需恢复时为双键（下两行二选一），否则为单键
// 可选：勾选「迁移后保留旧路径数据（不删除）」
await page.check('.adl-confirm-dialog__retain input');

// 确认（不重启）—— 或点「立即迁移并重启」
await page.click('button:has-text("下次启动时迁移")');

// 结果反馈：成功 → 「已恢复全部默认设置」；失败 → 「已恢复：…；失败：<组>（<原因>）」
```

> 失败即停：已成功的组不回滚，未执行的组计入「未执行」。摘要中的原因取自结构化错误消息，**不会出现内部步骤码**。
> 选择「立即迁移并重启」时，若后端返回需要重启，会实际调用 `storage.restartApp()`；桥不支持时提示「浏览器模式不可用」。

---

## 设置列表

> 通用组（`general`）的设置项列表；其余组由各自的富组件渲染。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-settings-controls-wrap` |

### 设置项

| 选择器 | 说明 |
|--------|------|
| `.adl-settings-row` | 单个设置项行（带 `data-settings-anchor="<组ID>:<设置项ID>"`） |
| `.adl-settings-row__label` | 标签区（含行级「恢复默认」图标按钮） |
| `.adl-settings-row__control` | 控件区 |

---

## 设置类型

### 下拉选择

```javascript
// 点击下拉框
await page.click('.adl-settings-row__control [aria-label="语言"]');

// 选择选项
await page.click('.adl-settings-dropdown__item:has-text("English")');
```

### 开关切换

```javascript
await page.click('.adl-settings-row__control input[type="checkbox"]');
```

### 文本输入

```javascript
await page.fill('.adl-settings-row__control input', 'value');
```

---

## 存储设置组

> 统一根 / 每类独立两种模式（`features/storage-settings/StorageSettings.tsx`）。10 条可迁移路径 + 1 个设置值路径（`downloads_default`，仅记录浏览器默认下载目录，不迁移）+ 6 项不可移动（keyring/机器身份/localStorage/IndexedDB/WebView2/工作区缓存，UI 附原因说明）。
>
> - 迁移二选一：立即迁移并重启（Tauri 经 `storage_*` 命令直写 locator + `app_restart`），或下次启动生效（浏览器模式 `restartApp` 返回 `NOT_SUPPORTED` 并提示）
> - 预检非纯只读：`preflight` 创建目标父目录并写 `.adl-write-probe` 探测文件
> - 空间未知：服务端 `freeBytes` 恒为 0 时 UI 跳过空间判定（不渲染 verdict）
> - 恢复全部默认时存储排最后（可能触发迁移与重启），见上文聚合确认框

## 日志设置

> 通用组：日志级别（`error/warn/info/debug/trace`）+ 终端日志模式 / 调试日志模式（`overwrite/append/multi`）。CLI/env 启动覆盖为 session-only（运行期保持 CLI 值、仅落盘并提示"下次启动生效"，落盘失败回滚运行期）；`RUST_LOG` 为硬顶。详见 [log-system-manual](../../../../development/log-system-manual.md)。

## DSH 设置

> DeepSeek Harness 版本管理（下载源 / 代理设置 / 测试连接已迁入「网络」组，本组仅剩版本管理块 + 块底只读摘要卡）：
> 版本管理块由**通用版本卡片**渲染（`features/harness/HarnessVersionCard.tsx`，DSH 与 OpenCode CLI 共用同一套 UI；OpenCode 仅多来源行下的终端可用性开关/说明）；
> DSH 通过适配器注入自己的 store/actions，并以插槽挂上运行态/来源读数与官方版本外链。
> 块头在卡外（装饰图标 + 主标题，无恢复按钮），卡内副标题行左说明（行首「?」提示图标 + 描述小字）、右控件；变更即自动保存。
> 「版本管理」块含版本来源 / 当前版本 / 检查更新 / 正式版本 / 预发布版本 / 官方版本信息行（单卡；OpenCode 同行，更新动作为“更新到最新”），
> 最下方为只读摘要卡「当前下载源：<registry>「<自动检测/手动选择>」」+「前往修改」（跳网络组；模式提示为中性灰）。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-dsh-settings` |

### 设置项

| 选择器 | 说明 |
|--------|------|
| `.adl-dsh-settings__header` | 块头（版本管理块为装饰图标 + 主标题；带 `data-settings-anchor="dsh:version"`） |
| `[data-settings-anchor="dsh:version"]` | 版本管理块头（无恢复按钮） |
| `.adl-harness-version` | 通用版本卡片根（两工具共用；DSH 组内只有这一张版本卡） |
| `.adl-harness-version__readout` | DSH 运行态/来源读数插槽（版本号 + 运行地址或系统安装路径 + 更新徽标） |
| `.adl-harness-version__action-btn` | 版本操作文字按钮（更新到最新/安装/切换/卸载/重装/取消） |
| `.adl-harness-version__picker` | 双通道版本选择器（稳定版 / 预发布各一） |
| `.adl-harness-version__menu` | 选择器展开菜单（Portal 挂 body） |
| `[data-settings-anchor="dsh:source"]` | 块底只读摘要卡（当前下载源 + 模式提示） |
| `.adl-dsh-settings__source-mode` | 摘要行的模式提示（中性灰，「自动检测」/「手动选择」） |
| `.adl-dsh-settings__action-btn` | 摘要卡的「前往修改」按钮 |

> 下载源 / 代理设置 / 测试连接三块已迁入「网络」设置组；本组只保留版本管理块与块底只读摘要卡。

### 操作流程

```javascript
// 版本管理块：检查更新 / 更新到最新
await page.click('button:has-text("更新到最新")');

// 稳定版 / 预发布：展开选择器选版本，再点行内操作
await page.click('.adl-harness-version__picker');
await page.click('.adl-harness-version__menu-item-action:has-text("1.0.0")');
await page.click('button:has-text("安装")');

// 卸载当前版本需二次确认（首次点击进入危险确认态，再次点击执行）
await page.click('button:has-text("卸载")');
await page.click('button:has-text("再次点击确认卸载")');

// 块底摘要卡只读；点「前往修改」跳到「网络」组改下载源
await page.click('button:has-text("前往修改")');
```

> 组级恢复默认经侧栏触发；该流程会**取消在途的自动保存防抖并立即落盘**，避免旧快照补写。

---

## 打开方式设置组

> 网址链接 / 文件的默认打开落点，以及智能体站点正文链接拦截（`features/preview/openByMethod.ts` 统一执行；Markdown 预览链接与智能体站点拦截链接同消费该设置）。

| 设置项 | 说明 |
|--------|------|
| 网址链接 | 三选一：中心 / 右侧浏览器面板 / 外部浏览器；两处下拉触发器等宽（`.adl-settings-dropdown--open-method`） |
| 文件 | 二选一：右侧文件面板 / 系统默认应用 |
| 智能体站点链接拦截 | 默认关闭（opt-in）；关闭时白名单行隐藏且两行间无分隔线（同一视觉组） |
| 智能体网址白名单 | 仅拦截开启时显示；卡片式新增（别称选填、站点必填归一为整站 origin）；浏览器模式整行置灰（跨域 iframe 不可注入） |

### 定位选择器

| 选择器 | 说明 |
|--------|------|
| `[data-settings-anchor="openMethod:linkOpenMethod"]` | 网址链接下拉行 |
| `[data-settings-anchor="openMethod:fileOpenMethod"]` | 文件下拉行 |
| `[data-settings-anchor="openMethod:agentLinkIntercept"]` | 拦截开关行 |
| `[data-settings-anchor="openMethod:openMethod:agentSiteWhitelist"]` | 白名单行（拦截开启时） |
| `.adl-settings-allowlist` | 白名单列表控件（条目支持按 origin 移除） |
| `.adl-prompt-modal`（Portal 挂 body） | 添加卡片对话框（别称/站点输入 + 取消/添加） |

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 设置面板 | `#settings-panel` | 设置面板容器 |
| 设置面板根 | `.adl-settings-panel` | `mod+F` 作用域宿主 |
| 首行工具栏 | `.adl-settings-panel__header` | 导航折叠 / 搜索 / 恢复全部默认 |
| 设置导航 | `.adl-settings-nav` | 设置组导航（搜索态仍可见） |
| 搜索结果 | `.adl-settings-search-results` | 跨组搜索结果列表 |
| 落点高亮 | `.adl-reveal-highlight`（`.is-active` 播放中，本面板带 `--accent` 变体） | 跳转落点临时高亮（1.4s，共享实现） |
| 设置项行 | `.adl-settings-row` | 带 `data-settings-anchor`；块内行另带 `data-settings-row`（行级落点） |
| 搜索历史卡片 | `.adl-settings-search-history`（`#adl-settings-search-history`） | 输入框聚焦且查询为空时列出历史（自建，替代浏览器原生自动填充下拉） |
| 聚合确认框 | `.adl-settings-reset-all-dialog`（复用 `.adl-confirm-*` 类） | 恢复全部默认 |
| DSH设置 | `.adl-dsh-settings` | DSH设置容器 |

---

## 相关文件

- `frontend/src/app/components/settings/SettingsPanel.tsx` — 面板壳、搜索态、恢复全部编排
- `frontend/src/app/components/settings/ResetAllDialog.tsx` — 聚合确认框
- `frontend/src/app/components/settings/SettingsSearchResults.tsx` — 搜索结果列表
- `frontend/src/app/components/settings/settingsSearchIndex.ts` — 搜索索引与 `anchorFor` 单一真源
- `frontend/src/shared/settings-reset/` — 各组重置的纯执行层（依赖注入）
