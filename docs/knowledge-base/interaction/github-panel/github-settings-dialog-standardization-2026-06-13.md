# GitHub 配置仓库信息对话框标准化

## 背景

GitHub CI 面板的"配置仓库信息"对话框在 UI/UX 上存在多项不规范问题：
- 自定义对话框样式与项目通用的 `adl-prompt-modal` 不一致
- Owner/Repo/Branch/Token 等标签与输入框占位符缺乏中英文切换支持
- Token 字段的"显示/隐藏"按钮放置在输入框外部，视觉上与字段脱节
- Token 字段下方显示冗长的本地存储提示，与配置上下文重复

## 目标架构

统一使用项目标准的 `adl-prompt-modal` 组件外壳，内部字段采用标准 `adl-prompt-modal__input`，交互行为与项目中同类对话框（如"添加快捷站点"）保持一致。

## 组件结构

```
GitHubSettingsDialog
├── 容器：adl-prompt-modal（Portal 渲染到 document.body）
│   ├── 面板：adl-prompt-modal__panel adl-prompt-modal__panel--wide
│   │   ├── 标题栏：标题 + 关闭按钮
│   │   ├── 主体区：adl-github-settings__body
│   │   │   ├── 字段 × 4：Owner / Repo / Branch / Token
│   │   │   │   ├── 标签：adl-github-settings__label
│   │   │   │   └── 输入框：adl-prompt-modal__input
│   │   │   └── Token 专属：adl-github-settings__token-input（含显示/隐藏切换）
│   │   └── 底部按钮：取消 / 保存并查询
```

## 核心交互行为

### 1. 对话框打开时自动聚焦

- `useEffect` 在 `open === true` 时重置 `owner/repo/branch/token` 状态
- `requestAnimationFrame` 后对 Owner 输入框调用 `focus()`，用户可直接开始输入
- 键盘支持：`Enter` 确认（调用保存逻辑），`Escape` 取消

### 2. 输入验证

- Owner 与 Repo 字段非空校验：`!owner.trim() || !repo.trim()`
- 保存按钮在未通过校验时禁用
- 错误信息在对话框主体底部以 `adl-github-settings__error` 样式显示

### 3. Token 显示/隐藏切换

- 在输入框**内部**最右侧放置切换按钮（`.adl-github-settings__token-toggle`）
- 通过 `state.tokenVisible`（boolean）切换 input 的 `type` 属性：`text` ↔ `password`
- 按钮内包含眼睛/闭眼 SVG 图标（内联 SVG，避免额外依赖）
- 按钮 title/aria-label 中英文切换：`ciShowToken` / `ciHideToken`

## i18n 覆盖清单

以下字段必须同时在 `zh-CN` 与 `en-US` 翻译文件中存在，**不得**在组件内使用硬编码字符串：

| 翻译键 | 中文 | 英文 | 用途 |
|--------|------|------|------|
| `ciSettingsDialogTitle` | 配置仓库信息 | Configure CI | 对话框标题 |
| `ciOwnerLabel` | 仓库所有者 | Owner | 字段标签 |
| `ciRepoLabel` | 仓库名 | Repo | 字段标签 |
| `ciBranchLabel` | 分支 | Branch | 字段标签 |
| `ciTokenLabel` | 访问令牌 | Token | 字段标签 |
| `ciTokenOptional` | 可选 | optional | Token 括号标注 |
| `ciOwnerPlaceholder` | 例如：用户名 | e.g. your-username | 占位符 |
| `ciRepoPlaceholder` | 例如：仓库名 | e.g. my-repo | 占位符 |
| `ciBranchPlaceholder` | 默认：main | default: main | 占位符 |
| `ciTokenPlaceholder` | 可选 · 提升限流 / 支持私有仓库 | optional · higher rate limit / private repos | 占位符 |
| `ciShowToken` | 显示 | Show | Token 按钮态 |
| `ciHideToken` | 隐藏 | Hide | Token 按钮态 |
| `ciSettingsCancel` | 取消 | Cancel | 底部按钮 |
| `ciSettingsSave` | 保存并查询 | Save & Query | 底部按钮 |
| `ciClose` | 关闭 | Close | 关闭按钮 aria-label |

## 最佳实践沉淀

### 对话框组件必须复用 `adl-prompt-modal`

- 禁止在组件内自行定义背景、边框、阴影、圆角等视觉属性
- 对话框容器统一使用 `createPortal` 渲染到 `document.body`，避免被父级 `overflow` 裁剪
- 关闭按钮使用标准 `IconClose(14)`，`aria-label` 使用翻译键

### Token 字段的"内联"切换按钮

CSS 结构：
```
.adl-github-settings__token-input    ← position: relative
├── input.adl-github-settings__token-field  ← padding-right 预留按钮区域
└── .adl-github-settings__token-toggle      ← position: absolute, right: 4px
```

此模式适用于所有需要内联操作的输入框，保持视觉一致性。

### 键盘与无障碍支持

- `role="dialog"` + `aria-modal="true"` + `aria-label`
- `Enter` 触发确认，`Escape` 触发取消
- 打开时自动聚焦首个输入框，符合通用表单交互预期
- 点击背景空白处（`target === currentTarget`）取消
