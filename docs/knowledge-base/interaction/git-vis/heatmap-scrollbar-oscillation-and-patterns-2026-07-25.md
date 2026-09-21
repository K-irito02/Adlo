# 日历热力图 Bug 修复经验 — 2026-07-25

## 1. ResizeObserver 滚动条振荡修复

**问题**：`overflow-y: auto` + `max-height` 的容器内，当 chart 高度略超阈值时，滚动条出现/消失导致 `ParentSize` 的 `ResizeObserver` 持续触发宽度变化，造成无限重渲染循环。

**根因**：滚动条占用 `contentRect` 宽度 → ParentSize 检测到变窄 → 单元格变小 → chart 变矮 → 滚动条消失 → 宽度恢复 → 循环。

**修复**：`.adl-git-vis__chart` 增加 `scrollbar-gutter: stable` 始终预留滚动条空间，切断反馈环路。同时加 `overflow-x: clip` 防止 `overflow-y: auto` 将 `overflow-x` 强制计算为 `auto`。

```css
overflow-y: auto;
overflow-x: clip;
scrollbar-gutter: stable;
```

## 2. 本地时区日期解析模式

**问题**：`new Date("YYYY-MM-DD")` 按 UTC 解析（ECMAScript 规范），与 `new Date(year, month, day)`（本地时区）不一致，导致边界日 `weekNum` 计算偏移，产生重复日期。

**修复**：强制本地时区解析：`new Date(date + 'T00:00:00')`。

## 3. `!bin.date` 替代哨兵值

**模式**：用 `date: undefined` 标记占位单元格（无真实数据），tooltip 判断 `!bin.date` 来决定是否显示，比引入 `count: -1` 哨兵值更语义化、更干净。

## 4. 遵循现有持久化模式

**教训**：新增 localStorage 持久化时应使用项目已有的 `makePersistedWriter`（50ms 去抖动写入），而非直接调用 `writeJson`。所有切片持久化应保持一致的去抖动模式。
