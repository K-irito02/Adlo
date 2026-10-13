# 中心面板区域

> 中心面板为中间区多标签宿主（`CenterPane`，`adl-center adl-center--tab-host`），经 `CenterTabStrip` 切换标签；无标签时显示统一入口页 `CenterEntryPage`（`adl-center-entry`，三入口：deepseek harness / 浏览器 / 终端）与缺 tab 提示（`adl-center__empty` + `adl-welcome__empty`）。
>
> 历史注记：旧消息流/Composer 文档已删除；内联状态栏文档（`statusbar.md`）模型/分支两节已删除，工作区节待按实现重写。下文选择器均为现行实现。

## 布局结构

```
┌────────────────────────────────────────────────────────────┐
│ CenterTabStrip（标题栏标签条：切换/真关闭/移回面板/拖拽排序）  │
├────────────────────────────────────────────────────────────┤
│ CenterPane（adl-center--tab-host）                           │
│  ├─ 有标签：dsh / 浏览器 / 终端视图（location='center'）      │
│  └─ 无标签：CenterEntryPage（三入口）+ adl-center__empty 提示 │
└────────────────────────────────────────────────────────────┘
```

## 元素索引

| 名称 | 文档 | 说明 |
|------|------|------|
| 中间区标签条 | [../titlebar/center-tabs.md](../titlebar/center-tabs.md) | 切换/关闭/拖拽排序 |
| dsh 视图 | `features/dsh/` | deepseek harness 宿主渲染（进程托管 + 版本管理见设置 DSH 组） |
| 浏览器视图 | [../rightpanel/tools/browser.md](../rightpanel/tools/browser.md) | 双模式浏览器（面板↔中心为同一 WebView 位置移动） |
| 终端视图 | [../rightpanel/tools/terminal.md](../rightpanel/tools/terminal.md) | xterm.js 多窗格 |

## 相关文档

- [statusbar.md](./statusbar.md) — 旧内联状态栏（工作区节待按 `WorkspaceSplitButton` 实现重写）
- [../titlebar/center-tabs.md](../titlebar/center-tabs.md) — 标签条操作细节

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-center.adl-center--tab-host` | 中心宿主容器（`CenterPane.tsx`） |
| `.adl-center-entry` | 统一入口页（`CenterEntryPage.tsx`） |
| `.adl-center__empty` + `.adl-welcome__empty` | 缺 tab 提示 |

## 注意事项

1. dsh 标签作为普通浏览器标签承载（`location='center'` + `isDsh`）；关闭 dsh 标签即彻底退出进程，不跨重启持久化
2. 面板↔中心为同一原生 WebView 的位置移动，而非两个实例
3. 面板的破坏性操作（关闭/清空/删除）跳过 `location === 'center'` 的标签
