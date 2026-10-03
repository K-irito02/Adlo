---
description: CSS 自定义属性命名空间——公共设计 Token 无前缀，组件/区域私有变量必须使用 --adl- 前缀
globs: ai-digital-life/frontend/**/*.css
alwaysApply: false
---

# 组件级 CSS 自定义属性 `--adl-` 前缀命名

## 规则描述

CSS 自定义属性分两类，命名空间必须区分：

- **公共设计 Token**（背景、文字、间距、圆角、阴影、语义色）：定义在 `styles/themes.css` / `styles/tokens.css`，使用无前缀的语义名（`--bg`、`--text-primary`、`--space-4`、`--accent`、`--border-default`）。
- **组件/区域私有变量**（几何、偏移、局部状态底色、滚动条宽度等局部单源值）：必须加 `--adl-` 前缀，定义在消费它的组件 CSS 内。

## 正确示例

```css
/* 组件私有（--adl- 前缀） */
.adl-clipboard {
  --adl-clipboard-row-height: 72px;
  --adl-clipboard-row-actions-width: 22px;
}

/* 公共 token（无前缀，定义在 themes/tokens） */
:root {
  --space-4: 16px;
  --border-default: var(--color-gray-200);
}
```

## 错误示例

```css
/* ❌ 组件私有变量未加前缀，与公共 token 命名空间混淆 */
.my-panel { --tree-row-hover: ...; }

/* ❌ 把组件私有值当公共 token 写进 themes.css 并被多组件引用 */
```

## 适用场景

在任意组件/区域 CSS 中新增局部变量（几何、偏移、状态色）时使用 `--adl-` 前缀；当某个值确需跨组件复用时，才提升为公共 Token 放入 `themes.css`/`tokens.css`，并在 `design-system/tokens.ts` 注册 TypeScript 类型。参考实现：`file-tree-core.css`、`leftbar-clipboard.css`、`reveal-highlight.css`、`themes.css`。
