# 内联 Diff 视图按钮滚动固定 — 设计文档

> **状态：** ✅ 已实现
> **本文档记录最终设计，与原始设计有差异。**

## 问题描述

在"取消自动换行"（no-word-wrap）模式下，内联 diff 视图（`.adl-cm-diff-viewer--inline`）中每个 `.cm-deletedChunk` 区块的"接受"/"拒绝"按钮（`.cm-chunkButtons`）在水平滚动、面板 resize、窗口 resize 等场景下出现幻影移动效果——按钮从旧位置滑动到新位置，而非直接出现在正确位置。

## 根因分析

### 1. CSS transition（主要根因）

```css
/* 原始 CSS */
.adl-cm-no-word-wrap .adl-cm-diff-viewer--inline .cm-deletedChunk .cm-chunkButtons {
  transition: right 0.04s ease-out, inset-inline-end 0.04s ease-out;
  will-change: right, inset-inline-end;
}
```

当 `positionChunkButtons()` 通过 JS 设置新的 `right` 值时，CSS 过渡动画立即开始播放（即使按钮处于 `visibility: hidden` 状态）。按钮重新显示时，过渡尚未完成，产生幻影移动效果。

**解决方案：** 移除 `transition` 和 `will-change` 属性。

### 2. 连续位置更新（resize 场景）

面板/窗口 resize 时，`ResizeObserver` 持续触发 → `schedule()` → `sync()` → `positionChunkButtons()` 每帧更新按钮的 `right` 值。按钮"跟随"边缘线移动，看起来像滑动效果。

**解决方案：** ResizeObserver 触发时立即隐藏按钮，resize 稳定后再显示。

## 设计方案

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                  ScrollLeftSyncPlugin                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │ 水平滚动条拖拽 │    │     ResizeObserver + debounce │   │
│  │              │    │                              │   │
│  │ onThumbMD ──→│    │  RO 触发 → hide + start timer│   │
│  │ hide buttons │    │  timer 到期 → show buttons   │   │
│  │              │    │  (isPointerDown 时跳过)      │   │
│  │ endDrag ────→│    │                              │   │
│  │ show buttons │    │  pointerup → 立即 show       │   │
│  └──────────────┘    └──────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │               sync() 方法                         │   │
│  │  - CSS 变量更新                                   │   │
│  │  - syncOverflow()                                │   │
│  │  - updateCustomScrollbar()                       │   │
│  │  - positionChunkButtons() (resize 活跃时跳过)     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 核心方法

#### `prepareAndShowChunkButtons(visibleWidth, scrollLeft)`

拖拽结束后调用，先定位后显示，确保按钮直接出现在正确位置。

#### `resetResizeDebounce()`

ResizeObserver 回调中调用，启动/重置 100ms debounce timer。timer 到期时检查 `isDragging` 和 `isPointerDown`，均非活跃时定位并显示按钮。

#### `onDocumentPointerUp()`

用户松开鼠标时立即结束 debounce，定位并显示按钮。解决拖拽停顿后按钮不出现的问题。

### 关键字段

| 字段 | 类型 | 用途 |
|------|------|------|
| `resizeDebounceTimer` | `ReturnType<typeof setTimeout> \| null` | resize debounce 状态跟踪 |
| `isPointerDown` | `boolean` | 指针按下状态，防止停顿期间误显示 |
| `isDragging` | `boolean` | 水平滚动条拖拽状态 |

### 生命周期

```
constructor()
  ├── 注册 document pointerdown/pointerup 事件
  ├── 创建自定义滚动条
  ├── 注册 scroll/wheel 事件
  └── 创建 ResizeObserver

destroy()
  ├── 移除 document pointerdown/pointerup 事件
  ├── 清理 resizeDebounceTimer
  ├── 移除 scroll/wheel 事件
  ├── 销毁自定义滚动条
  └── 断开 ResizeObserver
```

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/styles/regions.css` | 修改 | 移除 transition 和 will-change |
| `frontend/src/app/regions/right-panel/cmScrollLeftSync.ts` | 修改 | 新增 debounce、pointer 跟踪、prepareAndShow |
| `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts` | 修改 | 更新测试断言 |

## 测试

- 单元测试 15 项全部通过
- 类型检查无新增错误

## 相关文件

- [plan 文档](../plans/2026-05-16-chunk-button-scroll-fix.md)
- [cmScrollLeftSync.ts](../../../../frontend/src/app/regions/right-panel/cmScrollLeftSync.ts)
- [regions.css](../../../../frontend/src/styles/regions.css)