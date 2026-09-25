# 快捷键全量纳入自定义 — 设计文档

- 日期：2026-09-25
- 状态：已批准，待实现计划
- 前置工作：快捷键设置组改版已落地（sticky 顶栏、块头外置、行级/组级/顶级重置、三路搜索、空分组删除）

## 1. 背景与问题

设置页仅有 3 个真实快捷键（`workspace.new/open`、`settings.open`），而标题栏菜单、
工具切换 tooltip、文件右键菜单中展示了约 15 个"快捷键"文本。经代码核查：

- 唯一全局派发器是 `useKeyboardShortcuts`（`frontend/src/app/hooks/useKeyboardShortcuts.ts:66`），
  仅处理 3 个命令；其余 31 处 keydown 监听全是 Esc 关闭/方向键/录制。
- 所有菜单 `shortcut` 字段（`titleBarMenus.ts`）、`ToolSwitcher.tsx:25 TAB_META`、
  `FilesPanel.tsx:436 fileMenuItems` 均为**纯展示文本**，按下无反应。
- 展示与实际不符：设置行写 `Ctrl+,`，实际接线 `mod+shift+comma`；
  `Ctrl+Shift+``、 `Ctrl++/-`、`Ctrl+Shift+P` 等按下均无反应。
- 死功能项：`命令面板`（两处，action 为切文件面板占位）、`键盘快捷键`（空函数）、
  `查看许可证`（空函数）。

## 2. 命令清单（14 个，5 组）

| 组 | 命令 | 默认键 | 说明 |
|---|---|---|---|
| navigation | `workspace.new` / `workspace.open` | `mod+n` / `mod+o` | 已有，不动 |
| general | `settings.open` | `mod+shift+comma` | 已有，不动 |
| view（新增） | `view.files/changes/browser/terminal` | `mod+shift+e/g/b` + `` mod+shift+` `` | `setActiveRightTool` |
| zoom（新增） | `zoom.in/out/reset` | `mod+shift+plus` / `mod+-` / `mod+0` | 上提的 zoom 函数 |
| file（新增，scoped） | `copy-relative` / `copy-full` / `toggle-word-wrap` / `toggle-line-numbers` | `mod+shift+c` / `mod+alt+c` / `alt+z` / 未分配 | FilesPanel 局部 |

例外（不纳入，根因明确）：`退出 Alt+F4`（OS 级消费）；和弦 `Ctrl+K Ctrl+S`
（模型仅支持单次按键）；`命令面板/查看许可证`见 §3。

`titleKey` 复用现有 key（view/zoom 用 `menu*`，file 用 `file*`），不造重复字符串；
新增分组 key `settingsShortcutsGroup{View,Zoom,File}`（中英）。

## 3. 菜单重组与死功能项处置（已决策）

- 文件菜单：`新建工作空间 / 打开文件夹 / ── / 退出`。
- 视图菜单：`打开 · 文件面板 / 打开 · 变更面板 / 打开 · 浏览器面板 / 打开 · 终端面板
  / ── / 放大 / 缩小 / 重置缩放 / ── / 设置`。
- 改名用新 key `menuOpen*Panel` ×4（中英）；`menuNewTerminal` 保留给终端新建会话按钮；
  删除 `menuNewBrowser / menuOpenEditorWindow / menuDiffView / menuBrowserView /
  menuFileView / menuTerminalView`（仅菜单使用）。
- `命令面板`：删除汉堡一级入口 + 帮助子菜单行，清理 `onOpenCommandPalette` prop 链
  （App → TitleBar → HamburgerMenu，含测试 mock），删除 `menuCommandPalette` key。
- `键盘快捷键`：保留，接线为"打开设置并定位快捷键组"，去掉和弦显示。
- `查看许可证`：保留不动（仍为空函数占位）。

## 4. 派发机制

- 全局 10 个：`useKeyboardShortcuts` 扩 `COMMAND_HANDLERS`；`zoomBy/resetZoom`
  从 TitleBar 上提为共享 hook `useAppZoom`（菜单与快捷键共用）。
- 局部 4 个：FilesPanel 内新 hook，window keydown + `容器.contains(target)` 作用域判定，
  读 store 中的用户 keybinds；`copy-*` 无选中守卫跳过；原生 input/textarea/select 目标跳过。
- 冲突检测零改动（遍历 `DEFAULT_COMMANDS` 自动纳入新命令）。

## 5. 显示派生

- 三个菜单 builder 接受 `keybinds` 参数，`shortcut = formatKeybind(当前绑定)`，
  未分配不显示；`退出 Alt+F4` 例外保留字面量（注释说明）。
- ToolSwitcher 静态 shortcut 改为命令 id，组件内派生（设置 tab 复用 `settings.open`，
  终端 tab 复用 `view.terminal`）。
- FilesPanel 右键菜单同理；`行号`默认未分配，不显示文字。
- 附带修复设置行 `Ctrl+,` → 派生 `Ctrl+Shift+,`。

## 6. 约束重申（项目治理）

- 无 UI 文本硬编码（全部走 i18n key）；无 `all`/`**` 通配权限（不涉及）；
  双端一致（纯前端偏好字段，无新 IPC）；红绿测试；本产品未发布，不做兼容/迁移代码。

## 7. 测试计划

- `defaultCommands` 命令数 14；设置页 5 块 / 14 行级重置；菜单派生显示；
  zoom 上提前后行为一致；scoped 守卫（无选中/面板外不触发）；Hamburger 去命令面板分类；
  冲突覆盖新命令；`tsc --noEmit` + `eslint` 零警告；相关既有套件全绿。

## 8. 影响文件（预估）

`defaultCommands.ts`、`useKeyboardShortcuts.ts`、`App.tsx`、`TitleBar.tsx(+test)`、
`HamburgerMenu.tsx`、`titleBarMenus.ts`、`ToolSwitcher.tsx`、`FilesPanel.tsx`、
新建 `useAppZoom.ts` + FilesPanel scoped hook、i18n `menu.ts`/`settings.ts`（中英）、
`KeybindSettings.test.tsx` 及新增单测。
