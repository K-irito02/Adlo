# 滚动条模式切换实时更新修复总结

## 背景

右键菜单中切换 Minimap（缩略图）与标准滑动条模式时，编辑器正文区域的右侧内边距、Accept/Reject 按钮位置需要立即实时更新。

## 问题演化（三次迭代）

### 第一次方案：仅 CSS 变量

直接在 `render()` 中设置 `this.host.style.setProperty("--adl-editor-minimap-width", ...)`，期望 CSS 级联自动生效。

**结果**：CSS 变量设在 `.cm-editor` 上，但 `.cm-scroller` 的缓存不立即跟随 → Accept/Reject 按钮位置不变。

### 第二次方案：`requestMeasure` + 强制重排

在 `render()` 后加 `this.view.requestMeasure()` + `void getComputedStyle(this.scrollElement).paddingRight` 强制同步布局。

**结果**：无换行模式出现间隙（scroller 内联样式覆盖 CSS `padding-right: 0`）。

### 第三次方案（最终）：统一 CSS 变量 + 条件性内联

在 `render()` 顶部检测 `wrapper.classList.contains("adl-cm-no-word-wrap")`，分路径处理：

```typescript
// 统一设置 CSS 变量
wrapper.style.setProperty("--adl-editor-minimap-width", `${width}px`);

if (isNoWrap) {
  // 无换行：scroller 内联 padding 直接覆盖 CSS padding-right:0
  const sbw = parseFloat(getComputedStyle(scroller).getPropertyValue("--adl-scrollbar-width")) || 0;
  scroller.style.paddingRight = `${width - sbw}px`;  // 按钮移动
  wrapper.style.paddingRight = "0";                    // 防双重計空
} else {
  scroller.style.paddingRight = "";   // 清除内联，CSS 级联接管
  wrapper.style.paddingRight = "";    // 清除内联
}
void (wrapper ?? scroller).offsetHeight;  // 强制布局
```

## 根因

### 问题 1：CSS 变量级联断点

无换行模式下，CSS 规则 `.adl-cm-no-word-wrap .cm-scroller { padding-right: 0 }` 硬编码了 `0`。CSS 变量无法穿透。Accept/Reject 按钮（`position: absolute` 位于 scroller 内部）的位置只受 scroller padding 影响，因此不跟随 CSS 变量变化。

### 问题 2：双重计空间隙

无换行模式的 CSS 规则：
```css
.adl-cm-no-word-wrap.adl-cm-diff-viewer-wrapper {
  padding-right: calc(var(--adl-editor-minimap-width) - var(--adl-scrollbar-width));
}
```
如果 scroller 和 wrapper 同时拥有 padding，垂直滚动条轨道被双重计数。

## 架构变化

### 移除

- `attachToHost()` 中不再设置 CSS 变量到 `surfaceHost`
- `destroy()` 中不再清理 `surfaceHost` 上的 CSS 变量
- `host.style.removeProperty("--adl-editor-minimap-width")` 调用（不再需要）

### 统一

CSS 变量设置点从多个散布调用（host / surfaceHost）收敛到 `render()` 中的一个统一位置：`.adl-cm-diff-viewer-wrapper` / `.adl-cm-editor-wrapper` 包装元素。

### 新增

`render()` 顶部新增 `isNoWrap` 检测分支，用于两种模式的差异化处理。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/regions/right-panel/cmMinimap.ts` | `render()` 统一方案、`attachToHost()` 清理、`destroy()` 清理、`handleSettingsChanged()` / `applySettings()` 顺序调整 |
| `frontend/src/styles/regions.css` | 移除 `.adl-cm-minimap--standard` 的 `border-left` 和 `box-shadow` |
| `frontend/src/app/regions/right-panel/cmMinimap.test.ts` | 更新测试断言匹配新代码 |
| `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts` | 重新生成快照 |

## 验证

- 自动换行 ON + Minimap：✓ padding 正确，按钮随动 ✓
- 自动换行 ON + 标准：✓ padding 正确，按钮随动 ✓
- 取消换行 OFF + Minimap：✓ padding 正确，按钮随动 ✓
- 取消换行 OFF + 标准：✓ padding 正确，按钮随动 ✓
- 模式切换无间隙 ✓
- 无原生滚动条闪烁 ✓
