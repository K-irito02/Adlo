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
| `dsh` | DSH | 下载源和代理设置 |

> 组顺序与标签的单一真源为 `frontend/src/app/components/settings/settingsGroups.ts` 的 `SETTINGS_GROUPS`。

### 组级恢复默认

导航每行（`RESETTABLE_GROUPS` 内的组）带「恢复该组默认」按钮。全组已为默认值时该按钮禁用。

- `general` / `workspace` / `shortcuts`：走偏好 patch，弹出通用确认框
- `storage` / `browser` / `dsh`：切到该组并置「待处理」信号，由该组组件弹出自有确认框并执行多步流程

---

## 搜索设置

> 首行工具栏左侧。跨**全部 6 个组**检索设置项；结果按组分组，点击跳转到该设置项。

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

## DSH 设置

> DeepSeek Harness 下载源和代理设置。三块结构（下载源 / 代理设置 / 测试连接）：
> 块头在卡外（恢复默认图标 + 主标题），卡内副标题行左说明、右控件；变更即自动保存。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-dsh-settings` |

### 设置项

| 选择器 | 说明 |
|--------|------|
| `.adl-dsh-settings__header` | 块头（下载源/代理设置带恢复按钮，测试连接块为装饰图标；带 `data-settings-anchor`） |
| `[data-testid="dsh-source-reset"]` | 下载源块恢复默认按钮 |
| `[data-testid="dsh-proxy-reset"]` | 代理设置块恢复默认按钮 |
| `.adl-settings-row__control .adl-settings-dropdown__trigger` | 下载源/代理模式下拉框（自动检测/npmjs/npmmirror/自定义；自动检测/自定义/无） |
| `.adl-settings-input` | 自定义地址与代理配置字段（HTTP/HTTPS/直连名单） |
| `[data-testid="dsh-test-button"]` | 测试连接按钮（结果显示在按钮内，2 秒后恢复） |

### 操作流程

```javascript
// 选择下载源（自定义下拉：点触发器展开，再点选项；不再是 radio 卡片）
// 选项：自动检测 / npmjs（官方） / npmmirror（中国） / 自定义
await page.click('[aria-label="下载源"]');
await page.click('.adl-settings-dropdown__item:has-text("自定义")');

// 输入自定义地址（选中自定义后出现，变更即自动保存，无保存按钮）
await page.fill('[aria-label="自定义地址"]', 'https://custom-registry.example');

// 选择代理模式（选项：自动检测/自定义/无）
await page.click('[aria-label="代理模式"]');
await page.click('.adl-settings-dropdown__item:has-text("自定义")');

// 输入代理配置
await page.fill('[aria-label="HTTP 代理"]', 'http://proxy:8080');
await page.fill('[aria-label="HTTPS 代理"]', 'http://proxy:8080');
await page.fill('[aria-label="直连名单"]', 'localhost,127.0.0.1');

// 测试连接（结果显示在按钮内）
await page.click('[data-testid="dsh-test-button"]');

// 块级恢复默认（经确认对话框，乐观执行）
await page.click('[data-testid="dsh-source-reset"]');
await page.click('button:has-text("确认")');
```

> 组级恢复默认经侧栏触发；该流程会**取消在途的自动保存防抖并立即落盘**，避免旧快照补写。

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
