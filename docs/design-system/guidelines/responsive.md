# Responsive Design

Implementation: dispersed styles under `frontend/src/styles/` (`tokens.css` 断点变量 + `regions/*`、`center.css`、`form-layout.css`、`statusbar.css` 等；无单体 `layout.css`）。

The desktop renderer is a single window app; it is therefore tuned for **resizable desktop windows** rather than full mobile layouts, but it remains usable down to 640 px wide (minimum supported).

## Breakpoints（现行，以源码为准）

| Breakpoint | Effect |
| --- | --- |
| ≤ 960 px | statusbar 相关适配 |
| ≤ 640 px | 最小宽度：`form-layout` 等单列回退，保证可读 |

> 历史注记：旧 `grid--dashboard`/`grid--cols-3`、`container/container--wide/container--narrow`、`data-density` 均不存在，已删除相关章节。

## Touch & hover

The renderer uses `:hover` for affordances but never relies on it for required interactions, so it remains usable on touch hardware where pointer hover does not exist.

## Testing matrix

| Width | Manual smoke check |
| --- | --- |
| 960 px | statusbar 适配生效 |
| 640 px | Minimum supported — form 等单列回退，内容可读 |
