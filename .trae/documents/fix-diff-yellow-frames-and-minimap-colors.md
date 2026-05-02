# 修复 Diff Editor 黄色方框线条 & Minimap Diff 颜色不显示

## 问题分析

### Bug 1: 黄色方框线条

**根因**: Monaco DiffEditor 有大量颜色 token，我们只覆盖了部分。未覆盖的 token 使用 Monaco 默认的琥珀/黄色。

已设置的 token:
- `diffEditor.insertedTextBackground` ✅
- `diffEditor.insertedLineBackground` ✅
- `diffEditor.removedTextBackground` ✅
- `diffEditor.removedLineBackground` ✅
- `diffEditor.modifiedTextBackground` ✅ (透明)
- `diffEditor.modifiedLineBackground` ✅ (透明)

**缺失的关键 token** (Monaco 默认为黄色/琥珀):
- `diffEditor.insertedTextBorder` — 插入文本边框
- `diffEditor.removedTextBorder` — 删除文本边框
- `diffEditor.modifiedTextBorder` — 修改文本边框 (**最可能是黄色方框来源**)
- `diffEditor.insertedLineBorder` — 插入行边框
- `diffEditor.removedLineBorder` — 删除行边框
- `diffEditor.modifiedLineBorder` — 修改行边框 (**最可能是黄色方框来源**)
- `diffEditorGutter.insertedLineBackground` — 插入行 gutter 背景
- `diffEditorGutter.removedLineBackground` — 删除行 gutter 背景
- `diffEditorGutter.modifiedLineBackground` — 修改行 gutter 背景
- `diffEditorOverview.insertedForeground` — 概览栏插入色
- `diffEditorOverview.removedForeground` — 概览栏删除色
- `diffEditorOverview.modifiedForeground` — 概览栏修改色

### Bug 2: Minimap Diff 颜色不显示

**根因 A — 行号映射错误**:

`getDiffRanges` 回调中，对删除类型的行号使用了 `originalStartLineNumber`/`originalEndLineNumber`（原始文件行号），但 `getTotalLines()` 返回的是**修改后编辑器**的行数。

示例：原始文件 200 行，修改后 100 行。删除发生在原始第 150-160 行：
- `startY = (150-1)/100 * minimapHeight = 149%` → 被裁剪到 100%
- `endY = 160/100 * minimapHeight = 160%` → 被裁剪到 100%

指示器被定位到 minimap 最底部（甚至超出范围），完全错误。

**根因 B — 事件订阅时序问题**:

useEffect (L384) 在 `changePreview` 变化时运行，但此时 `diffEditorRef.current` 可能尚未设置（Monaco 异步加载）。导致：
- `getDiffEditor()` 返回 null
- `onDidUpdateDiff` 订阅从未建立
- 后续 diff 计算完成后，overlay 不会刷新

MutationObserver 作为后备机制，但只监听 `class` 和 `style` 属性变化，可能遗漏某些 diff 更新。

## 修复方案

### 修复 1: monacoTheme.ts — 补全所有 Diff 颜色 Token

**文件**: `frontend/src/app/monacoTheme.ts`

在现有 diff 颜色设置之后，添加所有缺失的 border/gutter/overview 颜色：

```typescript
// 已有的 diff background 设置保持不变
if (diffInsertBg) {
  colors["diffEditor.insertedTextBackground"] = diffInsertBg;
  colors["diffEditor.insertedLineBackground"] = diffInsertBg;
}
if (diffRemoveBg) {
  colors["diffEditor.removedTextBackground"] = diffRemoveBg;
  colors["diffEditor.removedLineBackground"] = diffRemoveBg;
}
colors["diffEditor.modifiedTextBackground"] = "#00000000";
colors["diffEditor.modifiedLineBackground"] = "#00000000";

// === 新增：消除所有 diff 边框/gutter 默认黄色 ===
// Border 颜色 — 全部透明
colors["diffEditor.insertedTextBorder"] = "#00000000";
colors["diffEditor.removedTextBorder"] = "#00000000";
colors["diffEditor.modifiedTextBorder"] = "#00000000";
colors["diffEditor.insertedLineBorder"] = "#00000000";
colors["diffEditor.removedLineBorder"] = "#00000000";
colors["diffEditor.modifiedLineBorder"] = "#00000000";

// Gutter 颜景 — 使用与行背景一致的颜色
if (diffInsertBg) {
  colors["diffEditorGutter.insertedLineBackground"] = diffInsertBg;
}
if (diffRemoveBg) {
  colors["diffEditorGutter.removedLineBackground"] = diffRemoveBg;
}
colors["diffEditorGutter.modifiedLineBackground"] = "#00000000";

// 概览栏 — 使用主题色或透明
colors["diffEditorOverview.insertedForeground"] = "#00000000";
colors["diffEditorOverview.removedForeground"] = "#00000000";
colors["diffEditorOverview.modifiedForeground"] = "#00000000";
```

### 修复 2: ChangesPanel.tsx — 修复行号映射和时序问题

**文件**: `frontend/src/app/regions/right-panel/ChangesPanel.tsx`

**2a. 修复 getDiffRanges 回调中的行号映射**:

```typescript
getDiffRanges: () => {
  const diffEd = getDiffEditor();
  if (!diffEd?.getDiffInformation) return null;
  const diffInfo = diffEd.getDiffInformation();
  if (!diffInfo || diffInfo.length === 0) return null;
  return diffInfo.map((change) => {
    const isInsert = change.originalStartLineNumber > change.originalEndLineNumber;
    const isDelete = change.modifiedStartLineNumber > change.modifiedEndLineNumber;
    const type: "insert" | "delete" = isDelete ? "delete" : "insert";
    
    // 统一使用 modified 行号，因为 minimap 渲染的是 modified editor 内容
    if (isDelete) {
      // 删除：modified 范围为空，在 modifiedStartLineNumber 位置显示单行指示器
      const line = change.modifiedStartLineNumber;
      return { startLine: line, endLine: line, type };
    }
    // 插入/修改：使用 modified 行号范围
    return {
      startLine: change.modifiedStartLineNumber,
      endLine: change.modifiedEndLineNumber,
      type
    };
  });
},
```

**2b. 修复时序问题 — 将 diffEditor 依赖的逻辑拆分为独立 useEffect**:

将 `onDidUpdateDiff` 订阅和 diff 相关回调分离出来，确保在 `diffEditorRef.current` 可用后再建立订阅。添加延迟重试机制：

```typescript
// 原有的 overlay useEffect 保持 getScrollState/setScrollTop 逻辑
// 新增一个 useEffect 专门处理 diff 相关的订阅和刷新
useEffect(() => {
  if (!changePreview || props.diffSideBySide) return;
  
  // 延迟检查 diffEditorRef 是否就绪
  const trySubscribe = () => {
    const diffEd = getDiffEditor();
    if (!diffEd) return false;
    // 建立 onDidUpdateDiff 订阅
    const disposable = diffEd.onDidUpdateDiff?.(() => controller.refresh());
    return disposable;
  };
  
  // 立即尝试
  const disposable = trySubscribe();
  if (disposable) return () => disposable.dispose();
  
  // 未就绪则延迟重试
  const timer = setTimeout(() => {
    trySubscribe();
  }, 200);
  return () => clearTimeout(timer);
}, [changePreview, props.diffSideBySide]);
```

**2c. 渲染 diff 颜色到 minimap canvas**:

在 `minimapVisualOverlay.ts` 的 `renderDiffIndicators` 中，将 diff 颜色直接渲染到 minimap 的 canvas 上，而不是仅创建 DOM div 元素。这样可以确保颜色与 minimap 内容层叠正确。

### 修复 3: minimapVisualOverlay.ts — 增强 diff 指示器渲染

**文件**: `frontend/src/app/regions/right-panel/minimapVisualOverlay.ts`

在 `renderDiffIndicators` 中添加调试日志（开发环境），并确保指示器元素有正确的内联样式作为后备：

```typescript
function renderDiffIndicators(
  minimap: HTMLElement,
  diffRanges: DiffRange[],
  totalLines: number
) {
  minimap.querySelectorAll(`.${DIFF_INDICATOR_CLASS}`).forEach((el) => el.remove());
  if (!diffRanges.length || totalLines <= 0) return;

  const minimapHeight = minimap.getBoundingClientRect().height;
  if (minimapHeight <= 0) return;

  diffRanges.forEach((range) => {
    const startLine = Math.max(1, range.startLine);
    const endLine = Math.max(startLine, range.endLine);
    if (endLine < 1 || startLine > totalLines) return;

    const startY = Math.max(0, (startLine - 1) / totalLines) * minimapHeight;
    const endY = Math.min(minimapHeight, endLine / totalLines) * minimapHeight;
    const height = Math.max(2, endY - startY);

    const indicator = document.createElement("div");
    indicator.className = `${DIFF_INDICATOR_CLASS} ${DIFF_INDICATOR_CLASS}--${range.type}`;
    indicator.style.cssText = `
      position: absolute;
      left: 0;
      width: 4px;
      top: ${startY}px;
      height: ${height}px;
      pointer-events: none;
      z-index: 10;
      border-radius: 0;
      background: ${range.type === "insert" 
        ? "var(--minimap-diff-insert, rgba(22, 163, 74, 0.6))" 
        : "var(--minimap-diff-remove, rgba(239, 68, 68, 0.6))"};
    `;
    indicator.setAttribute("aria-hidden", "true");
    minimap.appendChild(indicator);
  });
}
```

使用内联 `cssText` 作为后备，确保即使 CSS 变量未正确级联，颜色也能显示。

## 涉及文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `frontend/src/app/monacoTheme.ts` | 修改 | 补全所有 diff 颜色 token |
| `frontend/src/app/regions/right-panel/ChangesPanel.tsx` | 修改 | 修复行号映射 + 时序问题 |
| `frontend/src/app/regions/right-panel/minimapVisualOverlay.ts` | 修改 | 增强 diff 指示器渲染（内联样式后备） |

## 验证步骤

1. `npm run typecheck -w @ai-digital-life/desktop` — 零错误
2. `npx vitest run` — 所有测试通过
3. 浏览器验证：
   - 打开变更预览（内联模式）
   - 确认无黄色方框线条
   - 确认 minimap 显示绿色（插入）和红色（删除）指示器
   - 切换不同文件确认指示器位置正确
   - 切换主题（明/暗）确认颜色正确

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Monaco 版本差异导致 token 名称不同 | 颜色不生效 | 使用 `inherit: true`，未识别 token 被忽略 |
| 行号映射仍有偏差 | 指示器位置不准 | 使用 modified 行号作为统一基准 |
| 内联样式覆盖 CSS 变量 | 主题切换不生效 | 保留 CSS class + 变量，内联样式仅作 fallback |
