---
name: fix-minimap-slider-beyond-content
overview: 修复 minimap 滑块可被拖入空白区域的问题：通过 Monaco API 获取精确的 minimap 内容高度，约束滑块仅在内容区域内滑动
todos:
  - id: extend-scroll-state
    content: 扩展 ScrollState 类型增加 minimapContentHeight，重写 getMinimapContentHeight 优先使用精确值
    status: pending
  - id: extend-monaco-types
    content: 扩展 MonacoEditor.getLayoutInfo() 类型增加 minimap 子对象
    status: pending
    dependencies:
      - extend-scroll-state
  - id: update-files-panel
    content: 更新 FilesPanel EditorLike 类型和 getScrollState 回调，计算并传递 minimapContentHeight
    status: pending
    dependencies:
      - extend-monaco-types
  - id: update-changes-panel
    content: 更新 ChangesPanel getScrollState 回调，计算并传递 minimapContentHeight
    status: pending
    dependencies:
      - extend-monaco-types
  - id: update-tests
    content: 更新测试覆盖 ScrollState.minimapContentHeight 路径和 getMinimapContentHeight 精确值优先逻辑，运行测试验证
    status: pending
    dependencies:
      - extend-scroll-state
      - extend-monaco-types
      - update-files-panel
      - update-changes-panel
---

## 产品概述

修复 minimap 缩略图滑块与文件实际内容位置不对应的问题，确保滑块严格约束在 minimap 有内容渲染的区域内，无法拖入空白区域。

## 核心功能

- 滑块位置精确对应编辑器视口在文件中的位置
- 滑块可拖动范围严格限制在 minimap 实际渲染内容的区域
- 短/中等长度文件时，minimap 下半部分空白区域不可拖入，也不触发编辑器滚动
- 长文件时行为不变（内容填满 minimap，滑块可在全范围拖动）
- 同时修复"文件"面板和"变更"面板（内联状态）中的相同问题

## 技术栈

- TypeScript（现有），Monaco Editor API（`editor.getLayoutInfo().minimap`），无新依赖

## 实现方案

### 根因分析

当前 `getMinimapContentHeight` 在 `maxScroll > 0` 时直接返回 `minimapHeight`（容器全高），但 Monaco `proportional` 模式下 minimap 内容高度 = `lineCount × minimapLineHeight / devicePixelRatio`，远小于容器高度。

**具体示例**：50 行文件，`minimapLineHeight = 4.5`（设备像素），`DPR = 1.5`，`editorHeight = 600px`：

- minimap 内容高度 = `50 × 4.5 / 1.5 = 150px`（仅占容器 25%）
- `scrollHeight = 50 × 20 = 1000px > clientHeight = 600px`，所以 `maxScroll > 0`
- 当前代码返回 `minimapHeight = 600px` → 滑块可在 0-552px 范围拖动（含 450px 空白区域）
- 正确应返回 `150px` → 滑块只能在 0-102px 范围移动

### 核心策略

利用 Monaco 公共 API 精确计算 minimap 内容高度，替代当前不可靠的启发式推断：

```
minimapContentHeight = lineCount × minimapLineHeight / devicePixelRatio
```

- `minimapLineHeight`：通过 `editor.getLayoutInfo().minimap.minimapLineHeight` 获取（Monaco 0.55.1 已提供）
- `lineCount`：通过 `editor.getModel()?.getLineCount()` 获取
- `devicePixelRatio`：`window.devicePixelRatio`

将此值通过 `ScrollState.minimapContentHeight` 传递到 overlay 系统，`effectiveHeight = min(minimapHeight, minimapContentHeight)`，约束滑块位置和拖动范围。

### 数据流

```
Monaco API (getLayoutInfo.minimap + getModel.getLineCount)
  ↓
FilesPanel / ChangesPanel getScrollState 回调
  ↓ 计算 minimapContentHeight
ScrollState { scrollTop, scrollHeight, clientHeight, minimapContentHeight }
  ↓
getMinimapContentHeight(minimap, scrollState) → 优先使用 scrollState.minimapContentHeight
  ↓
computeMinimapVisualFrame({ minimapHeight, scrollRatio, visualHeight, contentHeight })
  ↓ effectiveHeight = min(minimapHeight, contentHeight)
overlay DOM: top / height
```

### 边界情况处理

- `getModel()` 返回 null → `minimapContentHeight` 为 undefined → 回退到启发式
- `minimapLineHeight` 为 0 或 undefined → `minimapContentHeight` 为 undefined → 回退
- `lineCount = 0` → `minimapContentHeight = 0` → overlay 隐藏
- 内容高度 < visualHeight → 滑块覆盖全部内容，travelRange = 0，不可拖动
- `scrollBeyondLastLine` → 不影响内容区域计算，滑块在内容底部停止
- `devicePixelRatio` 变化（切换显示器）→ 每次 getScrollState 调用都重新读取，自动适应

### 启发式回退

当 Monaco API 数据不可用时，保留现有启发式作为安全回退：

- `maxScroll <= 0`：`contentHeight = minimapHeight × (scrollHeight / clientHeight)`（正确）
- `maxScroll > 0`：`contentHeight = minimapHeight`（已知不精确，但作为回退可接受）

## 实现细节

### 目录结构

```
ai-digital-life/frontend/src/app/regions/right-panel/
├── minimapVisualOverlay.ts          # [MODIFY] ScrollState 增加 minimapContentHeight，重写 getMinimapContentHeight
├── minimapVisualOverlay.test.ts     # [MODIFY] 更新 getMinimapContentHeight 测试，新增 ScrollState.minimapContentHeight 测试
├── monacoTypes.ts                   # [MODIFY] MonacoEditor.getLayoutInfo() 返回类型增加 minimap 子对象
├── FilesPanel.tsx                   # [MODIFY] EditorLike 类型扩展，getScrollState 回调增加 minimapContentHeight 计算
└── ChangesPanel.tsx                 # [MODIFY] getScrollState 回调增加 minimapContentHeight 计算
```

### 关键类型变更

**ScrollState**（minimapVisualOverlay.ts）：

```typescript
export type ScrollState = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** Actual rendered content height in the minimap (CSS pixels).
   *  Computed from Monaco API: lineCount × minimapLineHeight / devicePixelRatio.
   *  When provided, constrains slider to content area. Falls back to minimapHeight when omitted. */
  minimapContentHeight?: number;
};
```

**MonacoEditor.getLayoutInfo()**（monacoTypes.ts）：

```typescript
getLayoutInfo(): {
  height: number;
  width?: number;
  contentWidth?: number;
  minimap?: {
    minimapLineHeight?: number;
  };
};
```

**getMinimapContentHeight**（minimapVisualOverlay.ts）：

```typescript
function getMinimapContentHeight(minimap: HTMLElement, scrollState: ScrollState | null): number {
  const minimapHeight = minimap.getBoundingClientRect().height;
  if (minimapHeight <= 0) return minimapHeight;
  // 优先使用 Monaco API 精确值
  if (scrollState?.minimapContentHeight != null) {
    return Math.min(minimapHeight, Math.max(0, scrollState.minimapContentHeight));
  }
  // 回退启发式（仅在 Monaco API 不可用时）
  if (!scrollState) return minimapHeight;
  const maxScroll = Math.max(0, scrollState.scrollHeight - scrollState.clientHeight);
  if (maxScroll <= 0) {
    const contentRatio = scrollState.scrollHeight / Math.max(1, scrollState.clientHeight);
    return Math.min(minimapHeight, Math.max(0, minimapHeight * contentRatio));
  }
  return minimapHeight;
}
```

**FilesPanel getScrollState 回调**：

```typescript
getScrollState: () => {
  const ed = getEditor();
  if (!ed) return null;
  const layoutInfo = ed.getLayoutInfo();
  const minimapLineHeight = layoutInfo.minimap?.minimapLineHeight;
  const lineCount = ed.getModel?.()?.getLineCount() ?? 0;
  let minimapContentHeight: number | undefined;
  if (lineCount > 0 && minimapLineHeight && minimapLineHeight > 0) {
    minimapContentHeight = lineCount * minimapLineHeight / window.devicePixelRatio;
  }
  return {
    scrollTop: ed.getScrollTop(),
    scrollHeight: ed.getScrollHeight(),
    clientHeight: layoutInfo.height,
    minimapContentHeight
  };
},
```

### 性能说明

- `getScrollState` 在每次 `syncAll()` 和 `scrollToPointer` 时调用，但只读取 3-4 个属性，开销可忽略
- `window.devicePixelRatio` 是同步属性读取，无性能问题
- 不引入额外的 DOM 查询或布局重排

### 向后兼容

- `minimapContentHeight` 为可选字段，不提供时回退到现有启发式
- `getLayoutInfo().minimap` 为可选子对象，Monaco 版本不支持时自动回退
- `computeMinimapVisualFrame` 接口不变，`contentHeight` 参数保持可选
- `scrollToPointer` 交互逻辑结构不变，仅 `effectiveHeight` 计算更精确