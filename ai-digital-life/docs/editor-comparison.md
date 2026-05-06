# 编辑器技术方案文档

> **状态：已完成迁移** — 2025年5月已从 Monaco Editor 迁移至 CodeMirror 6 混合方案。
>
> **已实现文件**：
> - `CodeEditor.tsx` — 代码编辑器组件
> - `DiffViewer.tsx` — Diff 对比组件（inline/side-by-side）
> - `cmTheme.ts` — CodeMirror 主题系统
> - `cmLanguages.ts` — 语言扩展加载器
> - `agentDecorations.ts` — Agent 变更装饰器
> - `cmMinimap.ts` — Minimap 导航系统
> - `cmInlineDiffBackgrounds.ts` — 内联 Diff 背景渲染
> - `cmFoldingTooltip.ts` — 折叠控件 Tooltip
> - `fileTypeRouter.ts` — 文件类型路由器
> - `MarkdownPreview.tsx` — Markdown 预览
> - `DocxPreview.tsx` — DOCX 预览
> - `PdfPreview.tsx` — PDF 预览
> - `LazyPreviews.tsx` — 懒加载包装器
> - `editorAdapters.ts` — EditorRef/DiffEditorRef 适配器
>
> **已删除文件**：
> - `monacoTheme.ts`
> - `monacoTypes.ts`

## 一、项目背景与需求

### 1.1 当前技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端框架 | React 19 |
| 状态管理 | Zustand 5 |
| 桌面框架 | Tauri 2.0 |
| 后端语言 | Rust |
| 当前编辑器 | CodeMirror 6 + @uiw/react-codemirror |

### 1.2 核心功能需求

1. **Agent文件变更操作**
   - 支持文件新增、删除、修改等操作
   - 变更记录查看（Diff预览）
   - 变更装饰器显示

2. **多格式文件支持**
   - 代码文件（TS/JS/JSON/YAML等）
   - 文本文件（TXT）
   - Markdown文件（MD）
   - 办公文档（DOCX/PDF等）

3. **编辑器特性**
   - 语法高亮
   - Diff对比（inline/side-by-side）
   - 主题同步
   - Minimap导航
   - 移动端适配（未来需求）

### 1.3 当前编辑器实现情况

项目当前使用 CodeMirror 6 和预览组件实现以下功能：

| 组件 | 文件路径 | 功能描述 |
|------|----------|----------|
| FilesPanel | `frontend/src/app/regions/right-panel/FilesPanel.tsx` | 文件树、代码编辑、Markdown 预览、Patch 预览 |
| ChangesPanel | `frontend/src/app/regions/right-panel/ChangesPanel.tsx` | Git 变更列表、Diff 预览、只读预览 |
| fileTree | `frontend/src/app/regions/right-panel/fileTree.tsx` | 文件树渲染与交互 |
| DiffViewer | `frontend/src/app/regions/right-panel/DiffViewer.tsx` | Diff 对比视图 |
| cmTheme | `frontend/src/app/regions/right-panel/cmTheme.ts` | CodeMirror 主题定义与同步 |
| cmLanguages | `frontend/src/app/regions/right-panel/cmLanguages.ts` | 语言扩展加载器 |
| cmMinimap | `frontend/src/app/regions/right-panel/cmMinimap.ts` | Minimap 导航系统 |
| cmInlineDiffBackgrounds | `frontend/src/app/regions/right-panel/cmInlineDiffBackgrounds.ts` | 内联 Diff 背景渲染 |
| fileTypeRouter | `frontend/src/app/regions/right-panel/fileTypeRouter.ts` | 文件类型路由器 |
| LazyPreviews | `frontend/src/app/regions/right-panel/LazyPreviews.tsx` | 懒加载预览包装器 |
| editorAdapters | `frontend/src/app/regions/right-panel/editorAdapters.ts` | 编辑器 ref 适配器 |
| changePreviewDiffRanges | `frontend/src/app/regions/right-panel/changePreviewDiffRanges.ts` | Diff 算法 |

---

## 二、方案选型结论

### 2.1 选定方案：混合方案

经过对Monaco Editor、CodeMirror 6、Ace Editor三款主流Web代码编辑器的对比评估，最终选定**混合方案**作为本项目的编辑器技术方案。

### 2.2 选型依据

| 考量维度 | 混合方案优势 |
|----------|--------------|
| 性能优化 | CodeMirror 6核心体积小，首屏加载更快 |
| 移动端支持 | CodeMirror 6原生支持触摸设备，为未来移动端适配做好准备 |
| 扩展性 | 模块化架构便于添加新功能，每种文件类型可独立优化 |
| 用户体验 | 不同文件类型使用最适合的组件，获得最佳体验 |
| 包体积 | 按需加载，避免引入不必要的依赖 |

### 2.3 其他方案简要说明

| 方案 | 未选择原因 |
|------|------------|
| Monaco Editor | 包体积大（约5MB），移动端支持差，构建配置复杂 |
| CodeMirror 6（单独使用） | 办公文档预览需要额外组件，单独使用无法满足多格式需求 |
| Ace Editor | 维护活跃度低，UI过时，社区衰退 |

---

## 三、混合方案架构设计

### 3.1 整体架构

针对不同文件类型使用不同的预览/编辑组件：

```
文件类型判断
    │
    ├── 代码文件 (.ts, .js, .json, .yaml, .css, .html, etc.)
    │       └── CodeMirror 6 编辑器
    │
    ├── Markdown文件 (.md)
    │       ├── 编辑模式：CodeMirror 6
    │       └── 预览模式：react-markdown
    │
    ├── 文本文件 (.txt)
    │       └── CodeMirror 6 (plaintext)
    │
    └── 办公文档
            ├── DOCX (.docx): mammoth.js 预览
            └── PDF (.pdf): pdf.js 预览
```

### 3.2 技术选型明细

| 文件类型 | 场景 | 组件方案 | 依赖包 |
|----------|------|----------|--------|
| 代码文件 | 编辑 | CodeMirror 6 | @uiw/react-codemirror |
| 代码文件 | 语法高亮 | CodeMirror语言扩展 | @codemirror/lang-* |
| 所有文件 | Diff预览 | CodeMirror Merge | @codemirror/merge |
| Markdown | 编辑 | CodeMirror 6 | @codemirror/lang-markdown |
| Markdown | 预览 | react-markdown | react-markdown, remark-gfm |
| TXT | 编辑/预览 | CodeMirror 6 | 默认plaintext模式 |
| DOCX | 预览 | mammoth.js | mammoth |
| PDF | 预览 | pdf.js | pdfjs-dist |

### 3.3 核心功能实现方案

#### 3.3.1 代码编辑

使用 **@uiw/react-codemirror** 作为CodeMirror 6的React封装，配合对应的语言扩展包实现语法高亮。

支持的语言扩展：
- @codemirror/lang-javascript（TypeScript/JavaScript/JSX/TSX）
- @codemirror/lang-json（JSON）
- @codemirror/lang-yaml（YAML）
- @codemirror/lang-html（HTML）
- @codemirror/lang-css（CSS）
- @codemirror/lang-markdown（Markdown）
- @codemirror/lang-sql（SQL）
- @codemirror/lang-python（Python）
- @codemirror/lang-rust（Rust）
- @codemirror/lang-xml（XML）

#### 3.3.2 Diff预览

使用 **@codemirror/merge** 扩展实现Diff功能，支持：
- Inline模式（内联对比）
- Side-by-side模式（并排对比）
- 变更高亮显示
- 合并控制

#### 3.3.3 Markdown预览

使用 **react-markdown** 配合 **remark-gfm** 插件实现Markdown渲染预览，支持：
- GitHub Flavored Markdown语法
- 代码块语法高亮
- 表格、任务列表等扩展语法
- 与编辑模式切换

#### 3.3.4 DOCX预览

使用 **mammoth.js** 将DOCX文档转换为HTML进行预览，支持：
- 文档结构解析
- 样式转换
- 图片嵌入

#### 3.3.5 PDF预览

使用 **pdf.js** 渲染PDF文档，支持：
- 页面渲染
- 缩放控制
- 文本选择

#### 3.3.6 主题系统

使用CodeMirror的主题扩展机制，实现与应用CSS变量主题系统的同步：
- 浅色主题
- 深色主题
- 主题动态切换

#### 3.3.7 Agent变更装饰器

使用CodeMirror的Decoration系统实现Agent变更标注：
- 新增行标记
- 修改行标记
- 删除行标记
- 与Diff功能联动

---

## 四、迁移计划

### 4.1 迁移阶段

```
Phase 1: 核心编辑器迁移
├── 安装 @uiw/react-codemirror 及语言包
├── 实现 FilesPanel 的 CodeMirror 版本
├── 迁移主题系统
└── 实现基础装饰器

Phase 2: Diff功能实现
├── 集成 @codemirror/merge
├── 重构 ChangesPanel
└── 迁移变更记录功能

Phase 3: 多格式支持
├── 集成 react-markdown（Markdown预览）
├── 集成 mammoth.js（DOCX预览）
├── 实现文件类型路由
└── 统一样式和交互

Phase 4: 优化与测试
├── 性能优化
├── 测试覆盖
└── 文档更新
```

### 4.2 迁移工作量评估

| 迁移项 | 工作量 | 说明 |
|--------|--------|------|
| 编辑器组件替换 | 中 | FilesPanel、ChangesPanel重构 |
| 主题系统迁移 | 中 | 重新实现主题同步逻辑 |
| Diff功能迁移 | 高 | 使用@codemirror/merge替代DiffEditor |
| 装饰器迁移 | 高 | 重写Agent变更装饰器 |
| Minimap迁移 | 低 | 评估是否需要，可使用简化方案 |
| 语言检测适配 | 低 | 保持现有detectEditorLanguage逻辑 |
| 多格式预览集成 | 中 | react-markdown、mammoth.js集成 |
| 测试用例更新 | 中 | 更新相关测试文件 |

### 4.3 预估总工作量

| 阶段 | 预估时间 |
|------|----------|
| Phase 1 | 1周 |
| Phase 2 | 1周 |
| Phase 3 | 1周 |
| Phase 4 | 0.5周 |
| **总计** | **3-4周** |

---

## 五、依赖包清单

### 5.1 核心依赖

| 依赖包 | 用途 |
|--------|------|
| @uiw/react-codemirror | CodeMirror 6 React封装 |
| @codemirror/merge | Diff/Merge功能 |
| @codemirror/theme-one-dark | 深色主题（可选） |

### 5.2 语言扩展

| 依赖包 | 支持语言 |
|--------|----------|
| @codemirror/lang-javascript | JavaScript, TypeScript, JSX, TSX |
| @codemirror/lang-json | JSON |
| @codemirror/lang-yaml | YAML |
| @codemirror/lang-html | HTML |
| @codemirror/lang-css | CSS, SCSS |
| @codemirror/lang-markdown | Markdown |
| @codemirror/lang-sql | SQL |
| @codemirror/lang-python | Python |
| @codemirror/lang-rust | Rust |
| @codemirror/lang-xml | XML |

### 5.3 多格式预览

| 依赖包 | 用途 |
|--------|------|
| react-markdown | Markdown渲染预览 |
| remark-gfm | GitHub Flavored Markdown支持 |
| mammoth | DOCX文档预览 |
| pdfjs-dist | PDF文档预览 |

---

## 六、注意事项

### 6.1 主题同步

当前项目已实现 CSS 变量与 CodeMirror 主题同步，新增编辑器样式时应继续沿用同一套主题扩展机制。

### 6.2 Minimap功能

CodeMirror 6的Minimap需要通过扩展实现，建议评估是否保留此功能，或使用简化方案。

### 6.3 Diff算法

项目已实现基于LCS的自定义Diff算法（changePreviewDiffRanges.ts），迁移后可选择：
- 继续使用现有算法
- 使用@codemirror/merge内置算法

### 6.4 装饰器系统

Agent变更装饰器需要使用CodeMirror的Decoration系统重新实现。

### 6.5 性能考量

- 大文件处理：CodeMirror 6性能优异，但仍需测试超大文件场景
- 懒加载：利用ES6动态导入实现组件懒加载
- 内存管理：注意多编辑器实例的内存释放

---

## 七、参考资料

- [CodeMirror 6 官方文档](https://codemirror.net/6/)
- [@uiw/react-codemirror 文档](https://uiwjs.github.io/react-codemirror/)
- [@codemirror/merge 文档](https://codemirror.net/6/docs/ref/#merge)
- [react-markdown 文档](https://github.com/remarkjs/react-markdown)
- [mammoth.js 文档](https://github.com/mwilliamson/mammoth.js)
- [pdf.js 文档](https://mozilla.github.io/pdf.js/)
