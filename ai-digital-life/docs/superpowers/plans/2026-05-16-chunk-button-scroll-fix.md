# 内联 Diff 视图按钮滚动固定 — 实现记录

> **状态：** ✅ 已完成
> **实际方案与原始设计不同，本文档记录最终实现。**

## 目标

消除"取消自动换行"模式下内联 diff 视图"接受"/"拒绝"按钮的幻影移动效果，确保按钮在以下所有场景中直接出现/消失，无过渡动画：

1. 水平滚动条拖拽
2. 右侧面板边缘线拖拽
3. 工具导航器边缘线拖拽
4. 应用程序窗口拖拽/缩放
5. 其他任何导致按钮位置变化的操作

## 最终实现方案

### 修改的文件

| 文件 | 变更 |
|------|------|
| `frontend/src/styles/regions.css` | 移除 CSS transition 和 will-change |
| `frontend/src/app/regions/right-panel/cmScrollLeftSync.ts` | 新增 debounce 机制、pointer 跟踪、prepareAndShow 方法 |
| `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts` | 更新测试断言 |

### 变更详情

#### 1. CSS 层 — 移除 transition 根因

**文件：** `regions.css`

移除 `.adl-cm-no-word-wrap .adl-cm-diff-viewer--inline .cm-deletedChunk .cm-chunkButtons` 的 `transition` 和 `will-change` 属性。

**原因：** CSS `transition: right 0.04s ease-out` 是幻影移动效果的根因。当 `positionChunkButtons()` 设置新的 `right` 值时，即使按钮处于 `visibility: hidden` 状态，CSS 过渡动画也会开始播放。按钮重新显示时，过渡尚未完成，产生幻影移动效果。

#### 2. 水平滚动条拖拽 — prepareAndShowChunkButtons

**方法：** `prepareAndShowChunkButtons(visibleWidth, scrollLeft)`

拖拽开始（`onThumbMouseDown`）时通过 `setChunkButtonsVisibility(false)` 隐藏按钮。拖拽结束（`endDrag`）时调用此方法，先定位后显示，确保按钮直接出现在正确位置。

#### 3. 面板/窗口 resize — ResizeObserver + debounce

**方法：** `resetResizeDebounce()`

ResizeObserver 触发时立即隐藏按钮，同时启动 100ms debounce timer。连续 resize 事件会重置 timer。timer 到期且指针已松开时，定位并显示按钮。

**字段：** `resizeDebounceTimer: ReturnType<typeof setTimeout> | null`

#### 4. 拖拽停顿检测 — isPointerDown

**字段：** `isPointerDown: boolean`

通过 `document` 级 `pointerdown`/`pointerup` 事件跟踪指针状态：
- 拖拽暂停（鼠标未松开）：timer 到期时不显示按钮，保留 `resizeDebounceTimer` 非 null 状态
- 松开鼠标：`onDocumentPointerUp` 检测到 `resizeDebounceTimer !== null`，立即定位并显示按钮

#### 5. 生命周期管理

`destroy()` 中清理：
- `document` 的 `pointerdown`/`pointerup` 事件监听
- `resizeDebounceTimer`（clearTimeout）

### 最终行为

| 场景 | 行为 |
|------|------|
| 水平滚动条拖拽 | 按钮隐藏 → 拖拽结束 → 直接出现 |
| 面板/窗口 resize | 按钮隐藏 → resize 稳定 → 直接出现 |
| 拖拽中停顿（鼠标未松） | 按钮保持隐藏 |
| 停顿后松开鼠标 | 按钮立即出现 |
| 普通滚动 | 按钮可见，位置正常更新 |
| 内容变更 | 按钮可见，位置正常更新 |

## 测试

- 单元测试：`cmPreviewStyling.test.ts` 15 项全部通过
- 类型检查：无新增类型错误

## 相关文件

- [spec 文档](../specs/2026-05-16-chunk-button-scroll-fix-design.md)
- [cmScrollLeftSync.ts](../../../../frontend/src/app/regions/right-panel/cmScrollLeftSync.ts)
- [regions.css](../../../../frontend/src/styles/regions.css)