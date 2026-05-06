# Monaco → CodeMirror 混合方案迁移 Spec

## Why

当前项目使用 Monaco Editor 作为唯一编辑器组件，但 Monaco 包体积大（约 5MB）、移动端支持差、构建配置复杂。CodeMirror 6 核心体积小、模块化架构好、原生支持触摸设备。混合方案针对不同文件类型使用最合适的组件，优化性能与用户体验。

## What Changes

- **BREAKING**：移除 `@monaco-editor/react` 依赖，替换为 `@uiw/react-codemirror` + CodeMirror 6 生态
- **BREAKING**：移除 `MonacoEditorRef` 类型，替换为编辑器无关的 `EditorRef` 抽象接口
- **BREAKING**：移除 `monacoTheme.ts`，替换为 CodeMirror 主题扩展
- **BREAKING**：移除 `monacoTypes.ts`，替换为编辑器无关的类型定义
- 新增文件类型路由器，根据文件扩展名分发到不同编辑/预览组件
- 新增 CodeMirror 6 编辑器组件（代码编辑、Diff 对比）
- 新增 Markdown 预览组件（react-markdown）
- 新增 DOCX 预览组件（mammoth.js）
- 新增 PDF 预览组件（pdfjs-dist）
- 重构 Minimap 视觉覆盖系统，适配 CodeMirror DOM 结构
- 重构 Agent 变更装饰器，使用 CodeMirror Decoration 系统
- 重构内联 Diff 背景渲染，适配 CodeMirror Merge 视图
- 重构折叠控件 Tooltip，使用 CodeMirror 折叠 API
- 重构 StickyContext，适配 CodeMirror 滚动/视口 API
- 新增编辑器状态持久化机制（光标、滚动位置、撤销历史）
- 更新所有相关测试文件

## Impact

- Affected specs: `tauri-shell.md`（无 Tauri Command 变更）、`design-system.md`（主题系统变更）、`quality-gates.md`（测试命令不变）
- Affected code:
  - `frontend/src/app/types.ts` — `MonacoEditorRef` 类型替换
  - `frontend/src/app/monacoTheme.ts` — 整体替换
  - `frontend/src/app/regions/right-panel/monacoTypes.ts` — 整体替换
  - `frontend/src/app/regions/right-panel/FilesPanel.tsx` — 核心重构
  - `frontend/src/app/regions/right-panel/ChangesPanel.tsx` — 核心重构
  - `frontend/src/app/regions/right-panel/minimapVisualOverlay.ts` — 重构适配
  - `frontend/src/app/regions/right-panel/changePreviewDiffRanges.ts` — 保留算法，调整输出格式
  - `frontend/src/app/regions/right-panel/inlineMinimapLayout.ts` — 适配 CodeMirror
  - `frontend/src/app/regions/right-panel/stickyContext.tsx` — 适配 CodeMirror API
  - `frontend/src/app/regions/right-panel/patchReview.ts` — 无变更
  - `frontend/src/app/App.tsx` — editorRef 类型与 mount 回调适配
  - `frontend/src/app/workspacePaths.ts` — `detectEditorLanguage` 返回值映射调整
  - `frontend/src/app/regions/right-panel/types.ts` — `RightPanelViewProps` 类型更新
  - 所有 `*.test.ts` 文件 — 适配新 API
  - `frontend/package.json` — 依赖变更

## ADDED Requirements

### Requirement: 编辑器抽象层

系统 SHALL 提供编辑器无关的抽象接口 `EditorRef`，使上层组件（App、Panel）不依赖具体编辑器实现。

#### Scenario: 上层组件通过抽象接口操作编辑器

- **WHEN** App.tsx 或 Panel 组件需要操作编辑器实例（获取选区、滚动到行、获取可见范围等）
- **THEN** 通过 `EditorRef` 接口操作，不直接引用 Monaco 或 CodeMirror 的 API

#### Scenario: 编辑器实现可替换

- **WHEN** 未来需要更换编辑器实现
- **THEN** 只需修改适配层，上层组件无需变更

### Requirement: 文件类型路由器

系统 SHALL 根据文件扩展名将文件分发到最适合的编辑/预览组件。

#### Scenario: 代码文件打开

- **WHEN** 用户打开 `.ts`、`.js`、`.json`、`.yaml`、`.css`、`.html`、`.sql`、`.py`、`.rs`、`.xml` 等代码文件
- **THEN** 使用 CodeMirror 6 编辑器，自动加载对应语言扩展

#### Scenario: Markdown 文件编辑

- **WHEN** 用户打开 `.md` 文件并处于编辑模式
- **THEN** 使用 CodeMirror 6 + Markdown 语言扩展

#### Scenario: Markdown 文件预览

- **WHEN** 用户切换到 Markdown 预览模式
- **THEN** 使用 react-markdown 渲染预览

#### Scenario: DOCX 文件预览

- **WHEN** 用户打开 `.docx` 文件
- **THEN** 使用 mammoth.js 将 DOCX 转换为 HTML 进行预览

#### Scenario: PDF 文件预览

- **WHEN** 用户打开 `.pdf` 文件
- **THEN** 使用 pdfjs-dist 渲染 PDF 页面

#### Scenario: 文本文件编辑

- **WHEN** 用户打开 `.txt` 或无法识别扩展名的文件
- **THEN** 使用 CodeMirror 6 plaintext 模式

#### Scenario: 不支持的二进制文件

- **WHEN** 用户打开图片、视频等不支持的二进制文件
- **THEN** 显示"不支持预览"提示

### Requirement: CodeMirror 6 代码编辑器

系统 SHALL 使用 `@uiw/react-codemirror` 作为 CodeMirror 6 的 React 封装，提供代码编辑功能。

#### Scenario: 语法高亮

- **WHEN** 用户打开代码文件
- **THEN** 根据文件语言自动应用语法高亮

#### Scenario: 代码编辑

- **WHEN** 用户在编辑器中修改内容
- **THEN** 通过 `onChange` 回调通知上层，与现有 `onEditorChange` 行为一致

#### Scenario: 只读模式

- **WHEN** 文件处于只读状态（如 Diff 预览中的原始内容）
- **THEN** 编辑器设为只读，禁止修改

### Requirement: CodeMirror Diff 对比

系统 SHALL 使用 `@codemirror/merge` 实现 Diff 对比功能，替代 Monaco DiffEditor。

#### Scenario: Inline 模式 Diff

- **WHEN** 用户选择 inline 模式查看变更
- **THEN** 在同一编辑器中内联显示原始与修改内容，变更行高亮

#### Scenario: Side-by-side 模式 Diff

- **WHEN** 用户选择并排模式查看变更
- **THEN** 左右两栏分别显示原始与修改内容，变更行对应高亮

#### Scenario: Diff 视图切换

- **WHEN** 用户在 inline 与 side-by-side 模式之间切换
- **THEN** 无闪烁平滑切换，滚动位置合理保持

### Requirement: 主题系统同步

系统 SHALL 使用 CodeMirror 的主题扩展机制，实现与应用 CSS 变量主题系统的同步。

#### Scenario: 浅色主题

- **WHEN** 应用主题为浅色
- **THEN** 编辑器使用浅色主题，背景、前景、语法高亮等颜色与 CSS 变量一致

#### Scenario: 深色主题

- **WHEN** 应用主题为深色
- **THEN** 编辑器使用深色主题，背景、前景、语法高亮等颜色与 CSS 变量一致

#### Scenario: 主题动态切换

- **WHEN** 用户切换应用主题
- **THEN** 编辑器主题即时同步更新，无需重新加载

### Requirement: Agent 变更装饰器

系统 SHALL 使用 CodeMirror 的 Decoration 系统实现 Agent 变更标注。

#### Scenario: 新增行标记

- **WHEN** Agent 变更类型为新增
- **THEN** 行背景显示绿色标记，gutter 显示对应图标

#### Scenario: 修改行标记

- **WHEN** Agent 变更类型为修改
- **THEN** 行背景显示蓝色标记，gutter 显示对应图标

#### Scenario: 删除行标记

- **WHEN** Agent 变更类型为删除
- **THEN** 行背景显示红色标记，gutter 显示对应图标

#### Scenario: 装饰器开关

- **WHEN** 用户切换 Agent 注释开关
- **THEN** 装饰器即时显示或隐藏

### Requirement: Minimap 导航

系统 SHALL 在 CodeMirror 编辑器中提供 Minimap 导航功能。

#### Scenario: Minimap 渲染

- **WHEN** 编辑器加载文件内容
- **THEN** Minimap 显示文件缩略内容，包含 Diff 变更颜色标记

#### Scenario: Minimap 拖拽滚动

- **WHEN** 用户在 Minimap 上拖拽
- **THEN** 编辑器内容同步滚动

#### Scenario: Minimap 右键菜单

- **WHEN** 用户在 Minimap 上右键
- **THEN** 显示设置菜单（渲染字符、缩略图大小、缩放比例、滑块行为、滑块突出度）

#### Scenario: Minimap 设置持久化

- **WHEN** 用户修改 Minimap 设置
- **THEN** 设置保存到 localStorage，下次打开时恢复

### Requirement: 编辑器状态持久化

系统 SHALL 在切换文件时保存和恢复编辑器状态。

#### Scenario: 光标位置恢复

- **WHEN** 用户切换到另一个文件后切回
- **THEN** 光标位置恢复到上次离开时的位置

#### Scenario: 滚动位置恢复

- **WHEN** 用户切换到另一个文件后切回
- **THEN** 滚动位置恢复到上次离开时的位置

#### Scenario: 撤销历史恢复

- **WHEN** 用户切换到另一个文件后切回
- **THEN** 撤销/重做历史保持可用

### Requirement: 折叠控件 Tooltip

系统 SHALL 为 CodeMirror 折叠控件提供本地化 Tooltip。

#### Scenario: 折叠控件悬停

- **WHEN** 用户悬停在折叠控件上
- **THEN** 显示"展开至第 N 行"或"折叠至第 N 行"的 Tooltip

### Requirement: StickyContext 上下文

系统 SHALL 在编辑器顶部显示当前可见区域的上下文信息。

#### Scenario: 滚动时更新

- **WHEN** 用户滚动编辑器内容
- **THEN** StickyContext 实时更新，显示当前可见区域附近的上下文条目

### Requirement: 懒加载

系统 SHALL 对非核心编辑器组件实现懒加载。

#### Scenario: 首次加载

- **WHEN** 应用首次加载
- **THEN** 仅加载 CodeMirror 核心和当前文件所需的语言扩展

#### Scenario: 切换到 Markdown 预览

- **WHEN** 用户首次切换到 Markdown 预览模式
- **THEN** 动态加载 react-markdown 及相关插件

#### Scenario: 切换到 DOCX/PDF 预览

- **WHEN** 用户首次打开 DOCX 或 PDF 文件
- **THEN** 动态加载 mammoth.js 或 pdfjs-dist

### Requirement: 语言检测映射

系统 SHALL 将现有 `detectEditorLanguage` 的输出映射到 CodeMirror 语言扩展。

#### Scenario: TypeScript 文件

- **WHEN** 打开 `.ts` 文件
- **THEN** 加载 `@codemirror/lang-javascript` 并配置为 TypeScript 模式

#### Scenario: JSON 文件

- **WHEN** 打开 `.json` 文件
- **THEN** 加载 `@codemirror/lang-json`

#### Scenario: 所有已支持语言

- **WHEN** 打开任何已支持语言的文件
- **THEN** 自动加载对应的 CodeMirror 语言扩展

## MODIFIED Requirements

### Requirement: RightPanelViewProps 接口

`RightPanelViewProps` 中的编辑器相关类型从 Monaco 特定类型变更为编辑器无关类型：

- `standardEditorRef: React.MutableRefObject<MonacoEditorRef | null>` → `standardEditorRef: React.MutableRefObject<EditorRef | null>`
- `diffEditorRef: React.MutableRefObject<MonacoEditorRef | null>` → 移除（Diff 视图内部管理）
- `onEditorMount: (editor: MonacoEditorRef, monaco: unknown) => void` → `onEditorMount: (editor: EditorRef) => void`
- `onDiffMount: (editor: MonacoEditorRef) => void` → `onDiffMount: (editor: EditorRef) => void`

### Requirement: detectEditorLanguage 返回值

`detectEditorLanguage` 函数返回值从 Monaco 语言标识符映射为 CodeMirror 语言标识符，保持函数签名不变，内部映射表更新。

## REMOVED Requirements

### Requirement: Monaco Editor 依赖

**Reason**: 替换为 CodeMirror 6 混合方案
**Migration**: 移除 `@monaco-editor/react` 依赖，安装 CodeMirror 相关依赖

### Requirement: Monaco 主题系统

**Reason**: Monaco 主题定义方式（`defineTheme` + `setTheme`）不适用于 CodeMirror
**Migration**: 使用 CodeMirror 的 `EditorView.theme()` 和 `EditorView.baseTheme()` 创建主题扩展

### Requirement: Monaco 全局命名空间

**Reason**: 当前代码将 Monaco 实例挂载到 `window.monaco`，CodeMirror 无此需求
**Migration**: 移除 `window.monaco` 相关代码，CodeMirror 通过模块导入使用

### Requirement: Monaco deltaDecorations API

**Reason**: CodeMirror 使用不同的 Decoration 系统
**Migration**: 使用 CodeMirror 的 `StateField` + `Decoration` 替代 `deltaDecorations`

### Requirement: Monaco DOM 选择器依赖

**Reason**: `minimapVisualOverlay.ts` 和 `ChangesPanel.tsx` 中的内联 Diff 背景渲染依赖 Monaco 特定 DOM 结构（`.monaco-diff-editor`、`.minimap-slider` 等）
**Migration**: 重写为基于 CodeMirror DOM 结构的选择器，或使用 CodeMirror ViewPlugin 进行 DOM 操作

### Requirement: cssColorToHex 函数

**Reason**: 该函数专为 Monaco minimap 颜色格式（仅接受 hex）设计，CodeMirror 主题支持标准 CSS 颜色格式
**Migration**: CodeMirror 主题直接使用 CSS 变量或标准颜色值，无需 hex 转换
