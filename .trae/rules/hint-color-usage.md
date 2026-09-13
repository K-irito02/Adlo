---
description: Hint color usage spec for drag handles and dividers, neutral gray instead of accent blue
globs: ai-digital-life/frontend/**/*
alwaysApply: false
---

# 提示色（Hint Color）使用规范

## 定义

提示色用于表达"位置 / 交互可能性"的悬停提示（拖拽手柄、分界线 hover/active），**不承载选中、品牌、焦点语义**。

## 核心规则

| 用途 | 必须使用 | 禁止使用 |
|------|----------|----------|
| 拖拽手柄 / 分界线 hover、active | `var(--text-secondary)` | `var(--accent)` 系蓝色（含 `--accent-hover` / `--accent-soft`） |
| 主操作、选中态、焦点环、链接 | `var(--accent)` 系 | 中性提示色 |

## 取值（亮暗主题均可见）

| Token | Light | Dark |
|-------|-------|------|
| `--text-secondary` | `#767676` | `#9a9a9a` |

- 亮主题终端底色 `#f8f8f8` 配 `#767676`，暗主题终端底色 `#0c0c0c` 配 `#9a9a9a`，对比度满足位置提示的可辨识要求。
- 需更强对比时可升级为 `var(--text-primary)`（亮 `#222222` / 暗 `#d8d8d8`），不得降级为 `--text-muted` 以下。
- 明度变化只走中性灰阶（白 → 灰 → 黑方向），不得引入彩色（蓝/绿/红）与语义色混淆。

## 适用选择器（已统一，hover/active 均为 `var(--text-secondary)`）

- `.adl-terminal-divider`（只读历史区 / 实时终端分界线）
- `.adl-tool-navigator__resize-handle`
- `.adl-rightpanel__resize-handle`
- `.adl-leftbar__resize-handle` / `.adl-leftbar__conversation-resize`
- `.adl-settings-nav__resize-handle`
- `.adl-cm-diff-viewer .adl-cm-diff-resizer`

新增可拖拽分界线/手柄时直接复用本规范，不得重新发明悬停色。

## 相关文件

- [design-system.md](./design-system.md#提示色hint) — 设计系统入口（指针）
- [tokens.md](../../docs/design-system/foundations/tokens.md#hint--提示色) — 文档侧规范
- [themes.css](../../ai-digital-life/frontend/src/styles/themes.css) — token 真源
- [terminal-panel.css](../../ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css) — 首个统一案例
