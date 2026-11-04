# Comprehensive i18n Overhaul

## 概述

对 Adlo 前端的国际化系统进行了全面升级，覆盖所有 UI 表面（tooltip、对话框、菜单、卡片、标签、aria-label、placeholder 等），消除了所有硬编码中文字符串。

## 架构变更

### TCopyContext + useTCopy（消除 prop drilling）

**之前：** `t: CopyDict` 从 `App.tsx` 逐层 prop drilling 传递到每个子组件，约 50+ 组件显式传递 `t` prop。

**之后：** 通过 `TCopyProvider` 在组件树顶层注入，组件通过 `useTCopy()` hook 直接获取 `t` 和 `formatT`。

```
App.tsx
  └─ <TCopyProvider t={t} locale={locale}>
       ├─ TitleBar        (useTCopy)
       ├─ LeftSidebar     (useTCopy)
       ├─ CenterPane      (useTCopy)
       └─ RightPanel      (useTCopy)
```

关键文件：
- `frontend/src/app/i18n/TCopyContext.tsx` — Context + Provider
- `frontend/src/app/i18n/useTCopy.ts` — Hook，返回 `{ t, locale, formatT }`
- `frontend/src/app/i18n/formatT.ts` — 模板插值函数，缺失 key 时回退显示 key 名称

### 翻译 key 增长

| 指标 | 之前 | 之后 |
|------|------|------|
| 总 key 数 | 683 | 889 |
| 领域数 | 10 | 13 |
| 文件数 | 21 | 28 |
| 翻译覆盖 | ~80% UI | ≈100% UI |

### 新增/修复领域文件

新增 key 覆盖：
- `common.ts` — 对话框、按钮、气泡、输入框、上下文构建器、环境控制栏等
- `browser.ts` — 视图模式、右键菜单、分类标签、标签页操作
- `ci.ts` — 所有 CI 上下文菜单（含嵌套操作）、日志查看器
- `changes.ts` — 文件树操作、重命名对话框、预览状态
- `communicate.ts` — 通信面板标签、工具栏操作
- `terminal.ts` — 命令历史、折叠/展开、终端标签
- `file.ts` — 文件树操作（刷新、置顶、展开/收起）

### 已修复的 Bug

1. `selectionPromptZh` — en-US 中使用了中文文本，已修复
2. `addToFileTree` — zh-CN 中包含 `[TODO:zh]` 标记，已修复
3. `ciViewOnGithub` — key 名 typo（`Github` → `GitHub`），与 `ciViewOnGitHub` 重复导致被静默覆盖，已删除重复 key

## 硬编码清理

共发现并修复 **~280 处**硬编码中文字符串：

| 区域 | 文件数 | 修复数 |
|------|--------|--------|
| Core 组件（WelcomeState, ContextBuilder, ActionButton 等） | 12 | ~80 |
| 浏览器功能（browserpanel, BrowserTreeEntry 等） | 5 | ~50 |
| GitHub/CI 功能（GitHubTreeEntry, GitHubPanel 等） | 5 | ~80 |
| 面板区域（ChangesPanel, FileNavigatorShell 等） | 6 | ~30 |
| 侧边栏（SessionList, LeftSidebar 等） | 3 | ~20 |
| Native title 属性迁移 | 8 | 8 |

## 翻译质量改进（en-US）

1. 删除重复 key `ciViewOnGithub`（被 `ciViewOnGitHub` 静默覆盖）
2. 统一省略号为 Unicode `…` 字符
3. 上下文菜单统一 Sentence case（`"Open With"` → `"Open with"`）
4. 修复语法/自然度问题（添加冠词、被动语态、用词优化）

## 菜单自适应宽度

**问题：** 英文长文本超出固定 176px 菜单卡片，与右侧 `!` 提示图标重叠。

**修复：**
- CSS 改为 `min-width: 176px; width: max-content; max-width: 90vw` 自适应宽度
- `!` 图标从 `position: absolute` 改为 flex 流式布局（`margin-left: auto`）
- 标签添加 `flex: 1; overflow: hidden; text-overflow: ellipsis` 溢出保护

## 经验教训

1. **逐渐迁移 vs 全量替换：** 使用 Context hook 替代 prop drilling 时，批量替换 50+ 组件可一次性完成，但需要确保所有 call site 同步更新。建议先用 grep 找出所有 `t={t}` 传递点。
2. **CSS 级联冲突：** `file-tree.css` 和 `file-operations.css` 定义相同选择器，后者覆盖前者。修复时应统一修改被覆盖的 CSS 而非重新排序。
3. **绝对定位的风险：** 菜单内 `!` 提示图标使用 `position: absolute` 导致文本重叠。flex 流式布局 (`margin-left: auto`) 是更可靠的方案。
4. **翻译 key 验收：** 新增 key 后必须运行 `check:i18n` 脚本验证对称性，否则 TypeScript 类型检查会失败。
5. **formatT 容错：** `formatT` 函数应始终对 `t[key]` 使用 `?? key` 回退，防止缺失 key 时渲染 `undefined` 文本。
