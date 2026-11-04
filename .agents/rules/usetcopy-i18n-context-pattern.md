---
description: 前端 i18n 通过 useTCopy() hook + TCopyContext 实现编译期类型安全的国际化
globs: adlo/frontend/src/**/*.tsx,adlo/frontend/src/**/*.ts
alwaysApply: false
---

# useTCopy i18n 上下文模式

所有面向用户的 UI 文本必须通过 `useTCopy()` hook 从 `TCopyContext` 读取。

## 架构

1. **字典定义**：i18n key 在 `src/app/i18n/zh-CN/` 中定义为唯一真源
2. **类型推导**：`CopyKey = keyof typeof zhCN` — key 类型从 zh-CN 字典自动推导
3. **上下文提供**：`TCopyProvider` 在根层级提供 `{ t, locale }` 上下文
4. **Hook**：`useTCopy()` 从 `TCopyContext` 读取，返回带类型的 `t` 对象
5. **使用**：组件顶部调用，通过 `t.someKey` 访问文本

## 规范

- **禁止硬编码字符串**：所有按钮标签、Tooltip、aria-label、占位符、过滤器标签、相对时间、日期格式、面包屑标签必须使用 i18n key
- **编译期安全**：`t` 对象类型为 `Record<CopyKey, string>`，拼写错误在编译时即可发现
- **语言切换 fallback**：避免依赖易变的 Zustand store 数据做渲染条件，始终提供 fallback

```tsx
import { useTCopy } from '@/app/i18n/useTCopy';

function MyComponent() {
  const { t } = useTCopy();
  return <button aria-label={t.someKey}>{t.someKey}</button>;
}
```

## 与 dev-rules.md 的关系

`dev-rules.md` 规定了"所有 UI 文本必须使用 i18n key"的策略要求，本文档描述了具体的实现模式和架构细节。
