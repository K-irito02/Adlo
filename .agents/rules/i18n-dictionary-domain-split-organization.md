---
description: i18n 字典必须按语言包/领域文件拆分组织，每个领域独立文件，通过 barrel 合并
globs: ai-digital-life/frontend/src/app/i18n/**
alwaysApply: false
---

## i18n 字典按语言包/领域拆分

### 规则描述

i18n 字典必须按 `locale/domain-name.ts` 结构组织，每个语言目录下的每一个领域拆分为一个独立文件。文件统一导出 `{domain}{Locale}` 命名惯例的对象字面量，通过 locale 级别的 `index.ts` barrel 用对象展开（spread）合并为单一导出对象。

### 目录结构

```
i18n/
├── en-US/
│   ├── index.ts         # export const enUS = { ...conversationEn, ...browserEn, ... }
│   ├── conversation.ts  # export const conversationEn = { ... }
│   ├── browser.ts       # export const browserEn = { ... }
│   ├── terminal.ts      # export const terminalEn = { ... }
│   ├── workspace.ts     # export const workspaceEn = { ... }
│   └── ...              # 每个 IPC 领域一个文件
└── zh-CN/
    ├── index.ts         # export const zhCN = { ... }
    ├── conversation.ts  # export const conversationZh = { ... }
    ├── browser.ts       # export const browserZh = { ... }
    └── ...              # 与 en-US 完全镜像
```

### 正确示例

```ts
// en-US/conversation.ts
export const conversationEn = {
  conversation: 'Conversation',
  noMessages: 'Send the first message...',
  welcomeOpenWorkspace: 'Open workspace',
};

// en-US/index.ts
export const enUS = {
  ...conversationEn,
  ...browserEn,
  ...workspaceEn,
  ...terminalEn,
};
```

### 错误示例

```ts
// 所有 key 挤在一个文件里
export const enUS = {
  conversation: 'Conversation',
  browserAddress: 'Search URL',
};

// 不遵循 {domain}{Locale} 命名
export const conv = { ... };
```

### 适用场景

所有面向用户的 UI 文本字典定义（en-US / zh-CN / 其他语言）。新增领域时：在 `en-US/` 和 `zh-CN/` 同时添加同名文件，并在两个 `index.ts` 中注册。
