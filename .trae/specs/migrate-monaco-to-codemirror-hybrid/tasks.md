# Tasks

- [x] Task 1: 安装 CodeMirror 及相关依赖包
  - [x] SubTask 1.1: 安装核心依赖 `@uiw/react-codemirror`、`@codemirror/merge`
  - [x] SubTask 1.2: 安装语言扩展包 `@codemirror/lang-javascript`、`@codemirror/lang-json`、`@codemirror/lang-yaml`、`@codemirror/lang-html`、`@codemirror/lang-css`、`@codemirror/lang-markdown`、`@codemirror/lang-sql`、`@codemirror/lang-python`、`@codemirror/lang-rust`、`@codemirror/lang-xml`
  - [x] SubTask 1.3: 安装多格式预览依赖 `react-markdown`、`remark-gfm`、`mammoth`、`pdfjs-dist`
  - [x] SubTask 1.4: 移除 `@monaco-editor/react` 依赖

- [ ] Task 2: 创建编辑器抽象层
  - [ ] SubTask 2.1: 定义 `EditorRef` 接口（替代 `MonacoEditorRef`），包含 getSelection、getModel、revealLineInCenter、getVisibleRanges、getScrollTop、setScrollPosition、onDidScrollChange、focus、setPosition 等方法
  - [ ] SubTask 2.2: 定义 `DiffEditorRef` 接口，包含 getModifiedEditor、getOriginalEditor、onDidUpdateDiff 等方法
  - [ ] SubTask 2.3: 实现 CodeMirror `EditorRef` 适配器，将 CodeMirror EditorView API 映射到 `EditorRef`
  - [ ] SubTask 2.4: 实现 CodeMirror `DiffEditorRef` 适配器，将 `@codemirror/merge` API 映射到 `DiffEditorRef`
  - [ ] SubTask 2.5: 更新 `frontend/src/app/types.ts`，用 `EditorRef` 替换 `MonacoEditorRef`

- [ ] Task 3: 实现 CodeMirror 主题系统
  - [ ] SubTask 3.1: 创建 `cmTheme.ts`，使用 `EditorView.theme()` 定义浅色和深色主题
  - [ ] SubTask 3.2: 从 CSS 变量读取颜色值（复用现有 `--editor-*`、`--editor-syntax-*`、`--editor-diff-*` 变量）
  - [ ] SubTask 3.3: 定义语法高亮样式（comment、keyword、string、number、regexp、type、function、variable）
  - [ ] SubTask 3.4: 定义 Diff 颜色样式（insert、delete 背景）
  - [ ] SubTask 3.5: 实现主题动态切换（响应 `resolvedTheme` 变化）

- [ ] Task 4: 实现语言检测映射
  - [ ] SubTask 4.1: 更新 `detectEditorLanguage` 函数，返回 CodeMirror 语言标识符
  - [ ] SubTask 4.2: 创建语言扩展加载器 `cmLanguages.ts`，根据语言标识符返回对应的 CodeMirror 语言扩展
  - [ ] SubTask 4.3: 实现语言扩展的按需加载（动态 import）

- [x] Task 5: 实现文件类型路由器
  - [x] SubTask 5.1: 创建 `fileTypeRouter.ts`，定义文件类型分类逻辑（代码、Markdown、文本、DOCX、PDF、二进制）
  - [ ] SubTask 5.2: 创建 `FileViewerRouter` 组件，根据文件类型渲染对应的编辑/预览组件
  - [ ] SubTask 5.3: 实现 Markdown 预览/编辑模式切换 UI

- [x] Task 6: 实现 CodeMirror 代码编辑器组件
  - [x] SubTask 6.1: 创建 `CodeEditor` 组件，封装 `@uiw/react-codemirror`
  - [x] SubTask 6.2: 集成主题、语言扩展、行号、自动换行、只读模式等配置
  - [x] SubTask 6.3: 实现 `onMount` 回调，创建 `EditorRef` 适配器并通知上层
  - [x] SubTask 6.4: 实现 `onChange` 回调，与现有 `onEditorChange` 行为一致
  - [x] SubTask 6.5: 实现编辑器状态持久化（光标、滚动位置、撤销历史），使用 `EditorState` 序列化

- [x] Task 7: 实现 CodeMirror Diff 对比组件
  - [x] SubTask 7.1: 创建 `DiffViewer` 组件，封装 `@codemirror/merge`
  - [x] SubTask 7.2: 实现 inline 模式 Diff 视图
  - [x] SubTask 7.3: 实现 side-by-side 模式 Diff 视图
  - [x] SubTask 7.4: 实现 Diff 视图切换（inline ↔ side-by-side）
  - [x] SubTask 7.5: 实现 `onMount` 回调，创建 `DiffEditorRef` 适配器

- [x] Task 8: 实现 Agent 变更装饰器
  - [x] SubTask 8.1: 创建 `agentDecorations.ts`，使用 CodeMirror `StateField` + `Decoration` 实现
  - [x] SubTask 8.2: 实现新增行装饰（绿色背景 + gutter 标记）
  - [x] SubTask 8.3: 实现修改行装饰（蓝色背景 + gutter 标记）
  - [x] SubTask 8.4: 实现删除行装饰（红色背景 + gutter 标记）
  - [x] SubTask 8.5: 实现装饰器开关（通过 `StateEffect` 控制）
  - [x] SubTask 8.6: 实现选中 hunk 高亮

- [x] Task 9: 实现 Minimap 导航系统
  - [x] SubTask 9.1: 评估 CodeMirror minimap 扩展方案（`codemirror-minimap` 或自定义实现）
  - [x] SubTask 9.2: 创建 `cmMinimap.ts`，实现 Minimap 视觉覆盖层
  - [x] SubTask 9.3: 适配 Minimap 拖拽滚动到 CodeMirror 的 `dispatch({ scrollTop })` API
  - [x] SubTask 9.4: 适配 Minimap 右键设置菜单
  - [x] SubTask 9.5: 适配 Minimap 设置持久化（复用现有 localStorage 逻辑）
  - [x] SubTask 9.6: 实现 Minimap 中的 Diff 变更颜色标记

- [x] Task 10: 实现内联 Diff 背景渲染
  - [x] SubTask 10.1: 创建 `cmInlineDiffBackgrounds.ts`，使用 CodeMirror `ViewPlugin` 实现
  - [x] SubTask 10.2: 实现 inline 模式下的 Diff 背景色带渲染
  - [x] SubTask 10.3: 实现滚动时背景色带位置同步

- [x] Task 11: 实现折叠控件 Tooltip
  - [x] SubTask 11.1: 创建 `cmFoldingTooltip.ts`，使用 CodeMirror 折叠 API 获取折叠区域信息
  - [x] SubTask 11.2: 实现悬停时显示"展开至第 N 行"/"折叠至第 N 行" Tooltip
  - [x] SubTask 11.3: 使用 `TooltipSimple` 组件显示 Tooltip（遵循项目规则，不使用原生 `title`）

- [x] Task 12: 适配 StickyContext
  - [x] SubTask 12.1: 更新 `stickyContext.ts`，使用 `EditorRef` 抽象接口替代 `MonacoEditor`
  - [x] SubTask 12.2: 适配 CodeMirror 的视口变化通知（`onViewportChange`）

- [x] Task 13: 实现多格式预览组件
  - [x] SubTask 13.1: 创建 `MarkdownPreview` 组件，使用 `react-markdown` + `remark-gfm`
  - [x] SubTask 13.2: 创建 `DocxPreview` 组件，使用 `mammoth.js`
  - [x] SubTask 13.3: 创建 `PdfPreview` 组件，使用 `pdfjs-dist`
  - [x] SubTask 13.4: 实现组件懒加载（`React.lazy` + `Suspense`）

- [x] Task 14: 重构 FilesPanel
  - [x] SubTask 14.1: 替换 Monaco `Editor` 为 `CodeEditor` 组件
  - [x] SubTask 14.2: 替换 Monaco `DiffEditor` 为 `DiffViewer` 组件
  - [x] SubTask 14.3: 更新编辑器选项构建逻辑（`buildMonacoEditorOptions` → `buildEditorOptions`）
  - [x] SubTask 14.4: 更新 Agent 装饰器应用逻辑
  - [x] SubTask 14.5: 更新 Minimap 覆盖层绑定逻辑
  - [x] SubTask 14.6: 更新 StickyContext 绑定逻辑
  - [x] SubTask 14.7: 更新折叠 Tooltip 控制器
  - [x] SubTask 14.8: 集成文件类型路由器

- [x] Task 15: 重构 ChangesPanel
  - [x] SubTask 15.1: 替换 Monaco `DiffEditor` 为 `DiffViewer` 组件
  - [x] SubTask 15.2: 更新 Diff 装饰器应用逻辑
  - [x] SubTask 15.3: 更新内联 Diff 背景渲染逻辑
  - [x] SubTask 15.4: 更新 Minimap 覆盖层绑定逻辑
  - [x] SubTask 15.5: 更新 StickyContext 绑定逻辑
  - [x] SubTask 15.6: 更新内联 Minimap 宽度计算逻辑

- [x] Task 16: 更新 App.tsx
  - [x] SubTask 16.1: 更新 `standardEditorRef` 类型为 `EditorRef`
  - [x] SubTask 16.2: 更新 `handleEditorMount` 回调签名
  - [x] SubTask 16.3: 更新 `handleDiffMount` 回调签名
  - [x] SubTask 16.4: 移除 `window.monaco` 全局引用

- [x] Task 17: 更新 RightPanelViewProps
  - [x] SubTask 17.1: 更新 `standardEditorRef` 类型
  - [x] SubTask 17.2: 更新 `onEditorMount` 和 `onDiffMount` 签名
  - [x] SubTask 17.3: 移除 `diffEditorRef`（Diff 视图内部管理）

- [x] Task 18: 清理废弃代码
  - [x] SubTask 18.1: 删除 `monacoTheme.ts`
  - [x] SubTask 18.2: 删除 `monacoTypes.ts`
  - [x] SubTask 18.3: 清理所有 Monaco 相关 import
  - [x] SubTask 18.4: 清理 Monaco 相关 CSS 样式（`.adl-agent-deco--*`、`.adl-inline-diff-*` 等 CSS 保留但适配）

- [x] Task 19: 更新测试文件
  - [x] SubTask 19.1: 删除 `monacoTypes.test.ts`（Monaco 特有测试不再适用）
  - [x] SubTask 19.2: 更新 `filesEditorOptions.test.ts` 适配新选项构建逻辑
  - [x] SubTask 19.3: 更新 `changesEditorOptions.test.ts` 适配新选项构建逻辑
  - [x] SubTask 19.4: 更新 `changesEditorSpacing.test.ts` 适配 CodeMirror DOM 结构
  - [x] SubTask 19.5: 更新 `changesEditorHighlight.test.ts` 适配 CodeMirror Decoration
  - [x] SubTask 19.6: 更新 `changesInlineMinimapLayout.test.ts` 适配 CodeMirror Minimap
  - [x] SubTask 19.7: 更新 `minimapVisualOverlay.test.ts` 适配 CodeMirror DOM
  - [x] SubTask 19.8: 更新 `changePreviewDiffRanges.test.ts`（算法不变，输出格式可能调整）
  - [x] SubTask 19.9: 更新 `stickyContext.test.ts` 适配 `EditorRef`

- [x] Task 20: 验证与优化
  - [x] SubTask 20.1: 运行 `npm run typecheck -w @ai-digital-life/desktop`，确保零类型错误
  - [x] SubTask 20.2: 运行 `npx vitest run`，确保所有测试通过
  - [ ] SubTask 20.3: 启动开发模式，手动验证文件编辑、Diff 预览、主题切换、Minimap、装饰器等功能
  - [ ] SubTask 20.4: 验证 Markdown 预览、DOCX 预览、PDF 预览功能
  - [ ] SubTask 20.5: 验证编辑器状态持久化（切换文件后恢复光标和滚动位置）
  - [ ] SubTask 20.6: 性能对比测试（首屏加载时间、包体积）

# Task Dependencies

- [Task 2] depends on [Task 1] (需要 CodeMirror 包才能实现适配器)
- [Task 3] depends on [Task 1] (需要 CodeMirror 包才能实现主题)
- [Task 4] depends on [Task 1] (需要语言扩展包)
- [Task 5] depends on [Task 2] (需要 EditorRef 抽象)
- [Task 6] depends on [Task 2, Task 3, Task 4] (需要抽象层、主题、语言扩展)
- [Task 7] depends on [Task 2, Task 3] (需要抽象层、主题)
- [Task 8] depends on [Task 2] (需要 EditorRef 抽象)
- [Task 9] depends on [Task 6] (需要编辑器组件)
- [Task 10] depends on [Task 7] (需要 Diff 组件)
- [Task 11] depends on [Task 6] (需要编辑器组件)
- [Task 12] depends on [Task 2] (需要 EditorRef 抽象)
- [Task 13] depends on [Task 1] (需要预览依赖包)
- [Task 14] depends on [Task 5, Task 6, Task 7, Task 8, Task 9, Task 11, Task 12] (FilesPanel 集成所有组件)
- [Task 15] depends on [Task 7, Task 8, Task 9, Task 10, Task 12] (ChangesPanel 集成 Diff 相关组件)
- [Task 16] depends on [Task 2] (需要 EditorRef 类型)
- [Task 17] depends on [Task 2] (需要 EditorRef 类型)
- [Task 18] depends on [Task 14, Task 15, Task 16] (所有引用清理后才能删除)
- [Task 19] depends on [Task 14, Task 15, Task 16, Task 17] (代码变更完成后更新测试)
- [Task 20] depends on [Task 18, Task 19] (所有变更完成后验证)

# Parallelizable Work

以下任务组可以并行执行：
- [Task 3, Task 4, Task 13] (主题、语言映射、多格式预览互不依赖)
- [Task 8, Task 9, Task 10, Task 11, Task 12] (装饰器、Minimap、Diff 背景、折叠 Tooltip、StickyContext 互不依赖)
- [Task 14, Task 15] (FilesPanel 和 ChangesPanel 重构可并行，但共享组件需先完成)
