# 内联 Diff 视图按钮滚动固定方案设计

## 问题

"取消自动换行"模式下，内联 diff 视图的"接受"/"拒绝"按钮存在两个问题：
1. **垂直居中不精确** — 按钮中心与行中心有子像素偏移
2. **水平滚动时抖动** — 按钮出现位置跳变和滞后感

## 根因

### 抖动/滞后根因：Layout Thrash（强制同步布局）

`ScrollLeftSyncPlugin.sync()` 方法存在**读写交叉**，导致每帧多次强制同步布局：

```
sync() {
  dom.style.setProperty(...)          // WRITE
  const padR = parseFloat(getComputedStyle(...))   // READ → 强制布局 #1
  dom.style.setProperty(...)          // WRITE
  const w = contentDOM.offsetWidth    // READ → 强制布局 #2
  positionChunkButtons() {
    scrollerRect = scrollDOM.getBoundingClientRect()  // READ → 强制布局 #3
    for (chunk of chunks) {
      r = chunk.getBoundingClientRect()  // READ → 强制布局 #N
      btn.style.right = ...           // WRITE
    }
  }
}
```

每次 `getComputedStyle()` / `offsetWidth` / `getBoundingClientRect()` 都会强制浏览器**同步计算样式和布局**。在滚动期间（16.6ms/帧），多次强制布局导致帧时间超过 16.6ms，产生视觉抖动。

### 垂直居中偏差根因：子像素累积误差

原公式 `top: 50% + margin-top: lineHeight/2 + transform: translateY(-50%)` 有三层堆叠，各层独立取整产生累积误差。

## 方案选择

排除了 CSS `position: sticky` 方案（无法在 scrollLeft=0 时固定在右边缘），选择**优化 RAF + 布局预读取**方案。

## 修改计划

### 文件 1：`cmScrollLeftSync.ts`

#### 1.1 读写分离 — 消除 Layout Thrash

将 `sync()` 重构为先读后写：

```typescript
private sync(): void {
  // === 阶段 1：批量读取 ===
  const scrollLeft = ...;
  const allReads = this.batchReadLayout();

  // === 阶段 2：批量写入 ===
  this.writeCSSVariables(allReads);
  this.updateOverflowClass(allReads);
  this.positionChunkButtons(allReads);
}
```

`positionChunkButtons` 接收预读取的布局数据，用 `chunk.offsetLeft` + `chunk.offsetWidth`（缓存的布局属性）替代 `chunk.getBoundingClientRect()`（强制布局）。

#### 1.2 缓存 latest scrollLeft

RAF guard 仍保留（合帧），但滚动事件中始终记录最新 scrollLeft，在 RAF 回调中使用最新值：

```typescript
private handleScroll = (): void => {
  this.pendingScrollLeft = this.view.scrollDOM.scrollLeft;
  this.schedule();
};

private sync(): void {
  const scrollLeft = this.pendingScrollLeft ?? this.view.scrollDOM.scrollLeft;
  this.pendingScrollLeft = null;
  // ...
}
```

#### 1.3 垂直居中公式简化

`(lineHeight - btnHeight) / 2` 直接作为 `top`，移除 `translateY` 和 `margin-top`。

### 文件 2：`regions.css`

保持现有 `transition: right 0.04s ease-out, inset-inline-end 0.04s ease-out` 和 `will-change: right, inset-inline-end` 不变（已在上一轮添加）。

### 文件 3：`cmPreviewStyling.test.ts`

更新断言以匹配重构后的代码引用。

## 验证标准

| 指标 | 目标 | 验证方式 |
|------|------|---------|
| 垂直居中偏差 | < 0.5px | 浏览器 `getBoundingClientRect()` 比较 |
| 水平固定 | 任意 scrollLeft 下 btnRight 恒定 | 浏览器 `getBoundingClientRect()` 比较 |
| 无 Layout Thrash | `sync()` 中无读写交叉 | 代码审查 |
| 单元测试 | 所有测试通过 | `npm test` |

## 风险与注意事项

1. `chunk.offsetLeft` 是相对 `.cm-content` 的布局偏移，不需异步且不触发布局（在已布局的帧中）
2. transition 0.04s 足够短不被感知，足够长覆盖帧间抖动
3. 此方案仅修改现有文件，不涉及 DOM 结构调整，兼容 CM Merge 内部渲染
4. `pendingScrollLeft` 确保 RAF 回调永远使用最新滚动位置，消除滞后
