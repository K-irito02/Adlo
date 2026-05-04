## 1. 高层摘要 (TL;DR)

*   **影响范围:** 🟡 **中等** - 新增编辑器顶部Sticky Context导航功能,涉及多个核心面板组件
*   **核心变更:**
    *   ✨ 新增 **Sticky Context** 功能,在编辑器顶部显示文件结构上下文(标题、函数等)
    *   🎨 在 **FilesPanel** 和 **ChangesPanel** 中集成Sticky Context组件
    *   🐛 修复 Monaco 主题构建时的空值检查问题
    *   📝 添加 Windows Rust 工具链开发文档
    *   🧪 新增完整的单元测试覆盖

---

## 2. 可视化概览 (代码与逻辑映射)

```mermaid
graph TD
    subgraph "Business Goal"
        A["用户快速定位文件上下文"]
        B["识别diff变更区域"]
    end
    
    subgraph "UI Components"
        C["StickyContextView.tsx"]
        D["FilesPanel.tsx"]
        E["ChangesPanel.tsx"]
    end
    
    subgraph "Core Logic"
        F["stickyContext.ts"]
        G["buildStickyContextEntries()"]
        H["createStickyContextModel()"]
        I["resolveStickyTone()"]
    end
    
    subgraph "Monaco Integration"
        J["monacoTypes.ts"]
        K["getEditorVisibleStartLine()"]
        L["navigateEditorToLine()"]
    end
    
    A --> D
    A --> E
    B --> F
    B --> I
    
    D --> C
    E --> C
    
    D --> F
    E --> F
    
    F --> G
    F --> H
    F --> I
    
    D --> J
    E --> J
    
    J --> K
    J --> L
    
    K --> G
    L --> H
    
    style A fill:#e3f2fd,color:#0d47a1
    style B fill:#e3f2fd,color:#0d47a1
    style C fill:#f3e5f5,color:#7b1fa2
    style F fill:#fff3e0,color:#e65100
    style J fill:#c8e6c9,color:#1a5e20
```

**数据流图:**

```mermaid
sequenceDiagram
    participant User as 用户
    participant Panel as FilesPanel/ChangesPanel
    participant Sticky as StickyContext
    participant Monaco as Monaco Editor
    participant Logic as stickyContext.ts
    
    User->>Monaco: 滚动编辑器
    Monaco->>Panel: onDidScrollChange
    Panel->>Monaco: getVisibleRanges()
    Monaco-->>Panel: visibleStartLine
    Panel->>Logic: buildStickyContextEntries()
    Logic->>Logic: 解析outline/diffRanges
    Logic-->>Panel: StickyContextEntry[]
    Panel->>Logic: createStickyContextModel()
    Logic-->>Panel: StickyContextModel
    Panel->>Sticky: 更新model
    Sticky-->>User: 显示上下文导航条
    
    User->>Sticky: 点击上下文条目
    Sticky->>Panel: onNavigateLine(line)
    Panel->>Monaco: revealLineInCenter()
    Monaco-->>User: 跳转到目标行
```

---

## 3. 详细变更分析

### 🎨 组件层变更

#### **StickyContextView.tsx** (新增)
*   **变更内容:** 新增React组件,负责渲染Sticky Context导航条
*   **关键特性:**
    *   显示文件顶部入口(带向上箭头图标)
    *   显示最多3个上下文条目(标题/函数/代码行)
    *   根据diff变更类型显示不同色调(插入/删除/修改)
    *   支持点击导航到对应行
*   **样式类:**
    *   `adl-sticky-context__row--top`: 顶部入口样式
    *   `adl-sticky-context__row--insert`: 插入变更(绿色)
    *   `adl-sticky-context__row--delete`: 删除变更(红色)
    *   `adl-sticky-context__row--modified`: 修改变更(渐变色)

#### **FilesPanel.tsx** (集成)
*   **变更内容:** 在文件编辑器面板集成Sticky Context
*   **关键修改:**
    *   新增 `stickyContextModel` 状态管理
    *   新增 `refreshStickyContext()` 回调函数
    *   新增 `buildStickyDiffRangesFromHunks()` 将patch hunks转换为diff范围
    *   监听编辑器滚动、布局变化、窗口大小变化事件
    *   在 `DiffEditor` 和标准 `Editor` 上方渲染 `<StickyContext />`
*   **代码示例:**
```typescript
const refreshStickyContext = useCallback(() => {
  const editor = getStickySourceEditor();
  const visibleStartLine = getEditorVisibleStartLine(editor) ?? 1;
  const contextEntries = buildStickyContextEntries({
    content: fileContent ?? "",
    outline,
    visibleStartLine,
    maxContextRows: 3,
    diffRanges: stickyDiffRanges
  });
  setStickyContextModel(createStickyContextModel({
    contextEntries,
    activeLine: visibleStartLine,
    canScrollToTop: visibleStartLine > 1,
    onNavigateLine: (line) => navigateEditorToLine(editor, line),
    topLabel: t.stickyContextTop
  }));
}, [fileContent, outline, stickyDiffRanges, t.stickyContextTop]);
```

#### **ChangesPanel.tsx** (集成)
*   **变更内容:** 在变更预览面板集成Sticky Context
*   **关键修改:**
    *   复用FilesPanel的集成模式
    *   使用 `changePreviewDiffRanges` 作为diff范围来源
    *   重命名 `changesPreviewShellRef` 为 `changesPreviewEditorShellRef`
*   **新增导入:**
    *   `StickyContext` 组件
    *   `buildStickyContextEntries`, `createStickyContextModel`, `StickyContextModel`
    *   `getEditorVisibleStartLine`, `navigateEditorToLine`

### 🧠 核心逻辑层变更

#### **stickyContext.ts** (新增)
*   **变更内容:** 实现Sticky Context的核心业务逻辑
*   **核心函数:**

| 函数名 | 功能 | 关键逻辑 |
|--------|------|----------|
| `buildStickyContextEntries()` | 构建上下文条目 | 优先使用outline(标题/函数),回退到代码行文本 |
| `createStickyContextModel()` | 创建数据模型 | 包含导航回调、激活状态、行数计算 |
| `resolveStickyTone()` | 解析变更色调 | 根据diffRanges判断insert/delete/modified/context |
| `buildOutlineEntries()` | 构建outline条目 | 过滤可见行之前的outline项,最多保留3个 |
| `buildFallbackLineEntries()` | 回退构建行条目 | 从可见行向上查找非空行,最多3个 |

*   **类型定义:**
```typescript
type StickyContextEntryKind = FileOutlineItem["kind"] | "line" | "top";
type StickyContextEntryTone = "top" | "context" | "insert" | "delete" | "modified";

interface StickyContextEntry {
  id: string;
  label: string;
  detail?: string;
  line: number;
  kind: StickyContextEntryKind;
  tone: StickyContextEntryTone;
  depth?: number;  // 标题层级(如H1/H2/H3)
}
```

#### **monacoTypes.ts** (扩展)
*   **变更内容:** 扩展Monaco编辑器类型定义,添加新的辅助函数
*   **新增类型:**
    *   `getSelection?()`: 获取光标选择范围
    *   `getVisibleRanges?()`: 获取可见行范围
    *   `onDidChangeHiddenAreas?()`: 监听隐藏区域变化
    *   `onDidLayoutChange?()`: 监听布局变化
*   **新增辅助函数:**

| 函数名 | 功能 | 参数 |
|--------|------|------|
| `getEditorVisibleStartLine()` | 获取编辑器可见起始行 | `editor: MonacoEditor \| null` |
| `navigateEditorToLine()` | 导航到指定行并聚焦 | `editor, line: number` |

*   **空值安全改进:**
    *   `getMinimapPosition()` 参数类型从 `MonacoNamespace \| undefined` 改为 `unknown`
    *   `createMonacoRange()` 添加 `monaco.Range` 存在性检查,抛出错误提示

### 🎨 样式层变更

#### **regions.css** (新增样式)
*   **变更内容:** 添加Sticky Context的完整样式系统
*   **关键样式类:**

| 类名 | 作用 | 样式特性 |
|------|------|----------|
| `.adl-sticky-context` | 容器 | sticky定位,毛玻璃背景,顶部z-index |
| `.adl-sticky-context__row` | 行条目 | grid布局,hover/active状态 |
| `.adl-sticky-context__rail` | 左侧色条 | 3px宽,根据tone显示不同颜色 |
| `.adl-sticky-context__kind` | 类型图标 | 18px宽,显示# / L / F等 |
| `.adl-sticky-context__copy` | 文本内容 | 标签+详情,省略号截断 |

*   **颜色映射:**
    *   `--diff-insert-line`: 插入变更(绿色)
    *   `--diff-remove-line`: 删除变更(红色)
    *   `--accent-primary`: 顶部入口(主色调)

### 🧪 测试层变更

#### **stickyContext.test.ts** (新增)
*   **变更内容:** 新增完整的单元测试覆盖
*   **测试用例:**

| 测试场景 | 验证内容 |
|----------|----------|
| 无outline时回退到行文本 | 确保始终显示文件顶部和行文本 |
| 优先使用outline上下文 | Markdown标题/代码函数优先显示 |
| 限制最多3个上下文行 | 验证resolveStickyContextRowCount() |
| diff范围标记色调 | 验证insert/delete/modified tone |
| 导航回调委托 | 验证scrollToTop/scrollToEntry |
| 集成测试 | 验证FilesPanel和ChangesPanel渲染 |

### 🐛 Bug修复

#### **monacoTheme.ts** (空值检查)
*   **变更内容:** 修复diff编辑器主题构建时的空值检查
*   **问题:** 当 `minimapInsertBg` 或 `minimapDeleteBg` 为 `undefined` 时,直接赋值会导致Monaco主题错误
*   **修复:** 添加空值判断后再设置颜色
```typescript
// 修复前
colors["diffEditor.insertedLineBackground"] = insertColorForMinimap;

// 修复后
if (insertColorForMinimap) {
  colors["diffEditor.insertedLineBackground"] = insertColorForMinimap;
}
```

### 📝 文档变更

#### **CONTRIBUTING.md** (新增)
*   **变更内容:** 添加Windows Rust工具链开发说明
*   **关键内容:**
    *   默认使用 `stable-x86_64-pc-windows-msvc`
    *   代理环境变量清理建议
    *   国内网络Rust镜像配置
    *   `minimal` profile说明
    *   `vcvars64.bat` 报错处理指南

#### **copy.ts** (国际化)
*   **变更内容:** 添加国际化文本键
*   **新增键值:**
    *   `stickyContextTop`: "文件顶部" / "File top"

#### **types.ts** (类型扩展)
*   **变更内容:** 扩展 `MonacoEditorRef` 类型定义
*   **新增属性:**
    *   `getLineCount?()`: 获取总行数
    *   `getVisibleRanges?()`: 获取可见范围
    *   `onDidScrollChange?()`: 滚动事件监听
    *   `onDidChangeHiddenAreas?()`: 隐藏区域变化监听
    *   `onDidLayoutChange?()`: 布局变化监听

---

## 4. 影响与风险评估

### ⚠️ 破坏性变更
*   **无** - 纯新增功能,未修改现有API

### 🎯 测试建议
*   **功能测试:**
    *   ✅ 验证FilesPanel中滚动编辑器时Sticky Context正确更新
    *   ✅ 验证ChangesPanel中diff视图的色调标记正确
    *   ✅ 验证点击Sticky Context条目能正确跳转到对应行
    *   ✅ 验证无outline文件时回退到行文本显示
    *   ✅ 验证窗口resize时Sticky Context正确刷新
*   **边界测试:**
    *   ✅ 空文件、单行文件
    *   ✅ 大文件(1000+行)性能
    *   ✅ 快速滚动时的防抖处理
    *   ✅ diff范围覆盖整个文件的情况
*   **回归测试:**
    *   ✅ 确认原有minimap功能正常
    *   ✅ 确认原有diff编辑器功能正常
    *   ✅ 确认原有文件导航功能正常

### 🔍 潜在风险
*   **性能风险:** 频繁的 `refreshStickyContext()` 调用可能影响大文件滚动性能(已通过限制maxContextRows=3缓解)
*   **内存泄漏:** ResizeObserver和事件监听器需确保正确清理(已在useEffect cleanup中处理)
*   **类型兼容:** Monaco编辑器类型扩展需确保与实际Monaco版本兼容(已添加空值检查和类型守卫)

---

## 5. 总结

本次变更实现了一个完整的 **Sticky Context** 导航功能,显著提升了代码浏览体验:

1.  **用户体验提升:** 用户无需滚动即可了解当前文件上下文
2.  **变更可视化:** 在diff视图中清晰标识插入/删除/修改区域
3.  **代码质量:** 新增完整单元测试,类型定义完善
4.  **文档完善:** 添加Windows开发环境说明

该功能设计合理,测试覆盖充分,风险可控,建议合并。

---

## 1. 高层摘要 (TL;DR)

*   **影响范围:** 🟡 **中等** - 重构了右侧面板的 Sticky Context 导航层和 Minimap 布局，涉及多个核心组件和样式
*   **核心变更:**
    *   Sticky Context 从面板顶部移入编辑器 surface 内部，采用绝对定位
    *   统一了 side-by-side 和 inline 模式的 Minimap 行为，始终显示在右侧
    *   新增顶部行智能显示逻辑（当文件第一行可见时自动隐藏）
    *   增强了 Monaco Range 构造器的类型安全检查

---

## 2. 可视化概览 (代码与逻辑映射)

```mermaid
graph TD
    subgraph "Business Goal"
        A["统一编辑器导航体验"]
        B["优化 Minimap 布局"]
        C["智能显示顶部导航"]
    end
    
    subgraph "FilesPanel.tsx"
        D["editorSurfaceRef"]
        E["StickyContext 组件"]
    end
    
    subgraph "ChangesPanel.tsx"
        F["changesPreviewEditorSurfaceRef"]
        G["DiffEditor 配置"]
    end
    
    subgraph "stickyContext.ts"
        H["createStickyContextModel"]
        I["showTopEntry 属性"]
        J["resolveStickyContextRowCount"]
    end
    
    subgraph "regions.css"
        K[".adl-sticky-context<br/>绝对定位"]
        L["side-by-side Minimap<br/>样式规则"]
    end
    
    A --> D
    A --> F
    A --> E
    B --> G
    B --> L
    C --> H
    C --> I
    C --> J
    
    E --> K
    G --> L
    
    style A fill:#e3f2fd,color:#0d47a1
    style B fill:#e3f2fd,color:#0d47a1
    style C fill:#e3f2fd,color:#0d47a1
    style K fill:#fff3e0,color:#e65100
    style L fill:#fff3e0,color:#e65100
```

---

## 3. 详细变更分析

### 📐 组件: Sticky Context 布局重构

**变更说明:**
将 Sticky Context 导航层从面板顶部移入编辑器 surface 内部，采用绝对定位，并预留 Minimap 空间。

**涉及的文件:**
- `stickyContext.ts` (Source)
- `stickyContextView.tsx` (Source)
- `regions.css` (Source)

**关键变更:**

| 变更项 | 旧行为 | 新行为 |
|--------|--------|--------|
| 定位方式 | `position: sticky` | `position: absolute` |
| 右边界 | 自动 | `right: var(--adl-editor-minimap-width, 84px)` |
| 顶部行显示 | 始终显示 | 根据 `showTopEntry` 条件显示 |
| 渲染位置 | surface 外部 | surface 内部 |

**代码片段 (stickyContext.ts):**
```typescript
// 新增 showTopEntry 属性控制顶部行显示
export interface StickyContextModel {
  // ... 其他属性
  showTopEntry: boolean;  // 新增
  rowCount: number;
}

// 修改行数计算逻辑
export function resolveStickyContextRowCount(
  entries: StickyContextEntry[], 
  includeTopEntry = true
): number {
  return Math.min(MAX_STICKY_CONTEXT_ROWS, entries.length) + 
         (includeTopEntry ? 1 : 0);
}
```

**代码片段 (stickyContextView.tsx):**
```typescript
// 条件渲染顶部行
export function StickyContext(props: StickyContextProps) {
  const entries = props.model.showTopEntry
    ? [props.model.topEntry, ...props.model.contextEntries]
    : props.model.contextEntries;

  if (entries.length === 0) {
    return null;  // 空状态不渲染
  }
  // ...
}
```

---

### 🎨 组件: Minimap 统一布局

**变更说明:**
移除了 side-by-side 模式下的特殊处理，统一了所有模式下的 Minimap 行为，始终显示在右侧并隐藏原生垂直滚动条。

**涉及的文件:**
- `ChangesPanel.tsx` (Source)
- `regions.css` (Source)

**关键变更:**

| 配置项 | 旧值 (side-by-side) | 新值 (统一) |
|--------|---------------------|-------------|
| minimap.enabled | `false` | `true` |
| minimap.side | - | `"right"` |
| scrollbar.vertical | `"auto"` | `"hidden"` |
| verticalScrollbarSize | `12` | `0` |

**代码片段 (ChangesPanel.tsx):**
```typescript
// 移除了 diffSideBySide 条件判断
minimap: {
  enabled: true,  // 始终启用
  side: "right" as const,
  size: minimapSettings.size,
  showSlider: minimapSettings.showSlider,
  renderCharacters: minimapSettings.renderCharacters,
  maxColumn: 80,
  scale: minimapSettings.scale
},
scrollbar: {
  vertical: "hidden" as const,  // 始终隐藏
  horizontal: "auto" as const,
  verticalScrollbarSize: 0,
  horizontalScrollbarSize: 10
}
```

**样式变更 (regions.css):**
```css
/* 新增 side-by-side 模式的 Minimap 样式 */
.adl-tool-editor--changes .monaco-diff-editor.side-by-side .editor.original .minimap {
  display: none !important;  /* 隐藏原始侧的 Minimap */
}

.adl-tool-editor--changes .monaco-diff-editor.side-by-side .editor.modified .minimap {
  position: absolute !important;
  right: 0 !important;
  width: 84px !important;
  /* 阴影和边框样式 */
}
```

---

### 🔧 组件: Monaco 类型安全增强

**变更说明:**
增强了 `createMonacoRange` 函数的类型检查，确保 Monaco Range 构造器可用且为函数类型。

**涉及的文件:**
- `monacoTypes.ts` (Source)
- `monacoTypes.test.ts` (Source)

**新增测试用例:**

| 测试场景 | 预期行为 |
|----------|----------|
| Monaco 暴露有效 Range 构造器 | 成功创建 Range 对象 |
| Monaco 未暴露 Range 构造器 | 抛出错误 "Monaco Range constructor is unavailable" |
| Range 存在但不是构造器 | 抛出错误 "Monaco Range constructor is unavailable" |

**代码片段 (monacoTypes.ts):**
```typescript
// 新增类型守卫函数
function isMonacoRangeConstructor(
  value: MonacoNamespace["Range"] | unknown
): value is NonNullable<MonacoNamespace["Range"]> {
  return typeof value === "function";
}

// 增强后的 createMonacoRange
export function createMonacoRange(
  monaco: MonacoNamespace,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
): MonacoRange {
  const RangeConstructor = monaco.Range;
  if (!isMonacoRangeConstructor(RangeConstructor)) {
    throw new Error("Monaco Range constructor is unavailable");
  }
  return new RangeConstructor(startLine, startColumn, endLine, endColumn);
}
```

---

### 📝 组件: 测试与文档更新

**变更说明:**
更新了设计系统文档和测试文档，新增了 Sticky Context 组件说明和回归测试指南。

**涉及的文件:**
- `docs/design-system/components.md` (Source)
- `docs/design-system/testing.md` (Source)

**新增文档内容:**
- Sticky Context 组件的设计规则和交互规则
- 右侧面板编辑器回归测试表格
- 必须运行的测试命令

**回归测试范围:**

| 测试文件 | 测试范围 |
|----------|----------|
| `stickyContext.test.ts` | Sticky 行派生、顶部行可见性、最大行数限制、diff 侧上下文选择 |
| `changesEditorOptions.test.ts` | Diff 编辑器选项、并排滚动策略、统一右侧 Minimap 行为 |
| `minimapVisualOverlay.test.ts` | Minimap 叠加层锚定和宽度预留规则 |
| `monacoTypes.test.ts` | Monaco 兼容性保护，包括 Range 构造器不可用时的安全失败 |

---

## 4. 影响与风险评估

### ⚠️ 破坏性变更

| 变更类型 | 影响范围 | 风险等级 |
|----------|----------|----------|
| Sticky Context 定位变更 | 所有使用右侧面板的用户 | 🟡 中等 - 可能影响滚动行为和视觉布局 |
| Minimap 行为统一 | side-by-side 模式用户 | 🟡 中等 - 改变了 Minimap 的显示方式 |
| 顶部行智能隐藏 | 所有文件查看场景 | 🟢 低 - 改善用户体验 |

### 🧪 测试建议

**必须测试的场景:**

1. **Sticky Context 定位测试**
   - ✅ 验证 Sticky Context 在编辑器 surface 内部正确渲染
   - ✅ 验证 Minimap 区域不被 Sticky Context 遮挡
   - ✅ 验证滚动时 Sticky Context 保持固定位置

2. **顶部行显示逻辑**
   - ✅ 滚动到文件顶部时，顶部行应自动隐藏
   - ✅ 向下滚动后，顶部行应重新出现
   - ✅ 空文件或无大纲文件应正确处理

3. **Minimap 布局测试**
   - ✅ side-by-side 模式下，Minimap 应显示在右侧
   - ✅ 原始侧的 Minimap 应被隐藏
   - ✅ 深色/浅色主题下 Minimap 样式应正确

4. **回归测试**
   ```bash
   npm --prefix frontend test -- --run \
     src/app/regions/right-panel/stickyContext.test.ts \
     src/app/regions/right-panel/changesEditorOptions.test.ts \
     src/app/regions/right-panel/minimapVisualOverlay.test.ts \
     src/app/regions/right-panel/monacoTypes.test.ts
   ```

5. **边界情况测试**
   - ✅ 空文件的 Sticky Context 行为
   - ✅ 超长文件的 Sticky Context 行数限制（最多 4 行）
   - ✅ Monaco Range 构造器不可用时的错误处理

---

## 5. 总结

本次重构主要优化了右侧面板的编辑器导航体验，核心改进包括：

1. **布局优化**: Sticky Context 采用绝对定位并移入编辑器 surface，避免与 Monaco 布局冲突
2. **行为统一**: 统一了 side-by-side 和 inline 模式的 Minimap 行为，提供一致的用户体验
3. **智能交互**: 顶部行根据滚动位置智能显示/隐藏，减少视觉干扰
4. **类型安全**: 增强了 Monaco API 的类型检查，提高代码健壮性

这些变更提升了编辑器的可用性和一致性，但需要仔细测试以确保滚动行为和视觉布局符合预期。

---

