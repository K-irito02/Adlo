---
description: 前端 `@` 路径别名导入约定，禁止相对路径深层嵌套
globs: ai-digital-life/frontend/src/**/*.ts,ai-digital-life/frontend/src/**/*.tsx
alwaysApply: false
---

# 前端 `@` 路径别名约定

所有 TypeScript/TSX 文件必须通过预定义的 `@` 路径别名导入模块，禁止使用相对路径深层嵌套导入。

## 正确示例

```typescript
import { useAppStore } from '@stores/slicedStore';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { isTauriShell } from '@shared/env';
```

## 错误示例

```typescript
import { useAppStore } from '../../stores/slicedStore';
import { isTauriShell } from '../../../shared/env';
```

## 适用场景

所有跨目录导入必须使用 `@` 别名。别名列表在 `vite.config.ts` 和 `tsconfig.json` 中同步维护，新增别名需双端同时更新。
