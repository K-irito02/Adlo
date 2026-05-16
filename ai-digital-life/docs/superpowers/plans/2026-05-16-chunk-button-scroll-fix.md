# 内联 Diff 视图按钮滚动固定 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除"取消自动换行"模式下内联 diff 按钮的 Layout Thrash 和延迟感

**Architecture:** 在 `ScrollLeftSyncPlugin` 中将读写分离为"批读取 → 批写入"两阶段，消除 `getBoundingClientRect()` / `getComputedStyle()` 与 `style.setProperty()` 交叉触发的强制同步布局。同时通过 `pendingScrollLeft` 缓存确保 RAF 回调始终使用最新滚动位置。

**Tech Stack:** TypeScript, CodeMirror 6 ViewPlugin, Vitest

---

### Task 1: 重构 sync() 为读写分离

**Files:**
- Modify: `frontend/src/app/regions/right-panel/cmScrollLeftSync.ts`

- [ ] **Step 1: 添加 LayoutData 接口和 batchReadLayout 方法**

在 `positionChunkButtons` 之前添加：

```typescript
interface ChunkLayoutData {
  btn: Element;
  chunkLeft: number;
  chunkWidth: number;
}

interface LayoutData {
  scrollLeft: number;
  paddingRight: number;
  scrollerClientWidth: number;
  contentWidth: number;
  contentLeft: number;
  lineHeight: number;
  chunks: ChunkLayoutData[];
}
```

在 `positionChunkButtons` 之前添加 `batchReadLayout` 方法：

```typescript
private batchReadLayout(): LayoutData {
  const scrollDOM = this.view.scrollDOM;
  const contentDOM = this.view.contentDOM;
  const isNoWrap = this.view.dom.closest(".adl-cm-no-word-wrap") !== null;
  const isInlineDiff = this.view.dom.closest(".adl-cm-diff-viewer--inline") !== null;

  const scrollLeft = this.pendingScrollLeft ?? scrollDOM.scrollLeft;
  this.pendingScrollLeft = null;

  const scrollerStyle = getComputedStyle(scrollDOM);
  const paddingRight = parseFloat(scrollerStyle.paddingRight) || 0;
  const scrollerClientWidth = scrollDOM.clientWidth;
  const contentWidth = contentDOM.offsetWidth;
  const contentRect = contentDOM.getBoundingClientRect();
  const contentLeft = contentRect.left;
  const lineHeight = parseFloat(getComputedStyle(contentDOM).lineHeight) || 18;

  const chunks: ChunkLayoutData[] = [];
  if (isNoWrap && isInlineDiff) {
    const buttons = this.view.dom.querySelectorAll(".cm-deletedChunk .cm-chunkButtons");
    for (const btn of buttons) {
      const chunk = btn.parentElement;
      if (!chunk) continue;
      chunks.push({
        btn,
        chunkLeft: chunk.offsetLeft,
        chunkWidth: chunk.offsetWidth,
      });
    }
  }

  return {
    scrollLeft,
    paddingRight,
    scrollerClientWidth,
    contentWidth,
    contentLeft,
    lineHeight,
    chunks,
  };
}
```

- [ ] **Step 2: 重构 sync() 方法**

```typescript
private sync(): void {
  const layout = this.batchReadLayout();
  const scrollDOM = this.view.scrollDOM;
  const dom = this.view.dom;

  const visibleWidth = layout.scrollerClientWidth - layout.paddingRight;

  // === 阶段 2：批量写入 ===
  dom.style.setProperty("--adl-editor-scroll-left", formatPx(layout.scrollLeft));
  scrollDOM.style.setProperty("--adl-editor-scroll-left", formatPx(layout.scrollLeft));
  dom.style.setProperty("--adl-editor-visible-width", formatPx(visibleWidth));
  scrollDOM.style.setProperty("--adl-editor-visible-width", formatPx(visibleWidth));
  dom.style.setProperty("--adl-editor-content-width", formatPx(layout.contentWidth));
  scrollDOM.style.setProperty("--adl-editor-content-width", formatPx(layout.contentWidth));

  const hasHorizontalOverflow = layout.contentWidth > visibleWidth + 1;
  const targetOverflowX = hasHorizontalOverflow ? "auto" : "hidden";
  if (this.lastOverflowX !== targetOverflowX) {
    this.lastOverflowX = targetOverflowX;
    if (hasHorizontalOverflow) {
      scrollDOM.classList.remove("adl-cm-scroller--no-hscroll");
    } else {
      scrollDOM.classList.add("adl-cm-scroller--no-hscroll");
    }
  }

  this.positionChunkButtons(layout);
}
```

- [ ] **Step 3: 重构 positionChunkButtons 接收 LayoutData**

```typescript
private positionChunkButtons(layout: LayoutData): void {
  if (layout.chunks.length === 0) {
    this.clearChunkButtonStyles();
    return;
  }

  const visibleWidth = layout.scrollerClientWidth - layout.paddingRight;
  const gap = 4;
  const activeChunks = new Set<Element>();

  for (const c of layout.chunks) {
    activeChunks.add(c.btn);

    // viewport-relative right edge of chunk
    const chunkViewportRight = layout.contentLeft + c.chunkLeft + c.chunkWidth - layout.scrollLeft;
    // desired button right edge (scroller content right - gap)
    const targetButtonRight = layout.contentLeft + visibleWidth - gap;
    const offset = Math.max(0, chunkViewportRight - targetButtonRight);

    const offsetKey = `${offset}px`;
    if (this.lastChunkPositions.get(c.btn) === offsetKey) continue;
    this.lastChunkPositions.set(c.btn, offsetKey);

    const btnEl = c.btn as HTMLElement;
    const btnHeight = btnEl.offsetHeight;
    const topOffset = (layout.lineHeight - btnHeight) / 2;

    const s = btnEl.style;
    s.setProperty("position", "absolute", "important");
    s.setProperty("top", `${topOffset}px`, "important");
    s.removeProperty("transform");
    s.removeProperty("margin-top");
    s.setProperty("right", `${offset}px`, "important");
    s.setProperty("inset-inline-end", `${offset}px`, "important");
    s.removeProperty("left");
  }

  for (const [btn] of this.lastChunkPositions) {
    if (!activeChunks.has(btn)) {
      const s = (btn as HTMLElement).style;
      s.removeProperty("position");
      s.removeProperty("top");
      s.removeProperty("transform");
      s.removeProperty("right");
      s.removeProperty("inset-inline-end");
      s.removeProperty("left");
      s.removeProperty("margin-top");
      this.lastChunkPositions.delete(btn);
    }
  }
}
```

- [ ] **Step 4: 修改 clearChunkButtonStyles 为实例方法（已有），确保清理全部样式**

```typescript
private clearChunkButtonStyles(): void {
  const buttons = this.view.dom.querySelectorAll(".cm-chunkButtons");
  for (const btn of buttons) {
    const s = (btn as HTMLElement).style;
    s.removeProperty("position");
    s.removeProperty("top");
    s.removeProperty("transform");
    s.removeProperty("right");
    s.removeProperty("inset-inline-end");
    s.removeProperty("left");
    s.removeProperty("margin-top");
  }
  this.lastChunkPositions.clear();
}
```

- [ ] **Step 5: 添加 pendingScrollLeft 字段并修改 handleScroll**

在 `frame` 字段之后添加：
```typescript
private pendingScrollLeft: number | null = null;
```

修改 `handleScroll`：
```typescript
private handleScroll = (): void => {
  this.pendingScrollLeft = this.view.scrollDOM.scrollLeft;
  this.schedule();
};
```

- [ ] **Step 6: 更新 update() 方法也存储 pendingScrollLeft**

```typescript
update(update: ViewUpdate): void {
  if (update.geometryChanged || update.viewportChanged || update.docChanged) {
    this.pendingScrollLeft = this.view.scrollDOM.scrollLeft;
    this.schedule();
  }
}
```

- [ ] **Step 7: 在 destroy 中清理 pendingScrollLeft**

```typescript
destroy(): void {
  this.view.scrollDOM.removeEventListener("scroll", this.handleScroll);
  if (this.frame) {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  this.pendingScrollLeft = null;
  const dom = this.view.dom;
  const scrollDOM = this.view.scrollDOM;
  for (const prop of ["--adl-editor-scroll-left", "--adl-editor-visible-width", "--adl-editor-content-width"] as const) {
    dom.style.removeProperty(prop);
    scrollDOM.style.removeProperty(prop);
  }
  scrollDOM.classList.remove("adl-cm-scroller--no-hscroll");
  this.lastOverflowX = null;
  this.clearChunkButtonStyles();
}
```

- [ ] **Step 8: 运行类型检查**

Run: `npm --prefix frontend run typecheck`
Expected: 无新类型错误（预先存在的错误可忽略）

### Task 2: 更新单元测试

**Files:**
- Modify: `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts`

- [ ] **Step 1: 更新"pins no-wrap inline merge controls"测试断言**

```typescript
it("pins no-wrap inline merge controls to the visible editor edge while horizontal scrolling", () => {
  const noWrapButtonsBlock = extractCssBlock(
    regionsCssSource,
    ".adl-cm-no-word-wrap .adl-cm-diff-viewer--inline .cm-deletedChunk .cm-chunkButtons {\n",
  );
  const deletedChunkBlock = extractCssBlock(
    regionsCssSource,
    ".adl-cm-no-word-wrap .adl-cm-diff-viewer--inline .cm-deletedChunk {\n",
  );

  expect(scrollLeftSyncSource).toContain("batchReadLayout");
  expect(scrollLeftSyncSource).toContain("chunkLeft");
  expect(scrollLeftSyncSource).toContain("chunkWidth");
  expect(scrollLeftSyncSource).toContain("pendingScrollLeft");
  expect(scrollLeftSyncSource).toContain("offsetLeft");
  expect(noWrapButtonsBlock).toContain("z-index: 20");
  expect(noWrapButtonsBlock).toContain("transition");
  expect(noWrapButtonsBlock).toContain("will-change");
  expect(deletedChunkBlock).toContain("position: relative");
});
```

- [ ] **Step 2: 运行测试**

Run: `npm --prefix frontend test -- --run src/app/regions/right-panel/cmPreviewStyling.test.ts`
Expected: 全部测试 PASS

### Task 3: 浏览器自动化验证

- [ ] **Step 1: 打开应用并进入 diff 视图取消自动换行**

```
agent-browser --session verify open http://127.0.0.1:5173
→ 打开 workspace
→ 进入"变更"标签
→ 点击菜单 → 取消"自动换行"
→ 点击第一个 diff 文件
```

- [ ] **Step 2: 验证位置精确度**

```javascript
// 检查 no-wrap class
document.querySelector('.cm-scroller').closest('.adl-cm-no-word-wrap') !== null

// 检查按钮位置：滚动到 scrollLeft=0, 200, 500, 0
// 验证 btnRight 始终等于 targetRight（偏差 < 1px）

// 检查垂直居中：
// btnCenterY 与 lineCenterY 偏差 < 1px
```

Expected: 所有场景下按钮固定在目标位置，垂直居中偏差 < 0.5px

- [ ] **Step 3: 截图保存**

```bash
agent-browser --session verify screenshot "path/to/screenshot.png"
```

- [ ] **Step 4: 关闭会话**

```bash
agent-browser --session verify close --all
```
