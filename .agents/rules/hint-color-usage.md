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

- 终端底色亮 `#f8f8f8` / 暗 `#0c0c0c` 下对比度亮 ≈4.3:1 / 暗 ≈7.0:1，作为 1–3px 非文本位置指示器按 WCAG 非文本 ≥3:1 即满足要求。
- 需更强对比时可升级为 `var(--text-primary)`（亮 `#222222` / 暗 `#d8d8d8`），不得降级为 `--text-muted` 以下。
- 明度变化只走中性灰阶（白 → 灰 → 黑方向），不得引入彩色（蓝/绿/红）与语义色混淆。

## 适用选择器（已统一，hover/active（拖拽态含 `--dragging` 类）均为 `var(--text-secondary)`）

- `.adl-tool-navigator__resize-handle`
- `.adl-rightpanel__resize-handle`
- `.adl-leftbar__resize-handle` / `.adl-leftbar__conversation-resize`
- `.adl-settings-nav__resize-handle`
- `.adl-cm-diff-viewer .adl-cm-diff-resizer`
- `.adl-terminal-col-divider` / `.adl-terminal-row-divider`（终端均分模式分割边界线）
- `.adl-terminal-free-handle--move`（终端自由模式移动手柄，默认小圆点、悬停/拖拽展开）

新增可拖拽分界线/手柄时直接复用本规范，不得重新发明悬停色。

## 特殊提示警醒色 / 填充色通用规则（用户指令）

- 特殊提示、警醒、填充等场景**一律使用白 / 灰 / 黑中性色**；明度、纯度、配比由实现方自行设计，但必须同时兼顾亮、暗两个主题下的可见性（非文本指示器对比度 ≥3:1，正文 ≥4.5:1）。
- **未经用户允许，不得擅自使用蓝色（含 `var(--accent)` 系）或其他彩色**作为上述场景的颜色；需其它颜色时先与用户确认。
- 选中态、焦点环、主操作、链接等承载语义的场景仍走 `var(--accent)` 系，不与本条中性提示色混用。

## 相关文件

- [design-system.md](./design-system.md#提示色hint) — 设计系统入口（指针）
- [tokens.md](../../docs/design-system/foundations/tokens.md#hint--提示色) — 文档侧规范
- [themes.css](../../ai-digital-life/frontend/src/styles/themes.css) — token 真源
- [terminal-panel.css](../../ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css) — 首个统一案例
