# 浏览器自动化脚本方案 — 经验教训总结

> 来源：2026-05-16 变更面板测试脚本开发过程中的实际调试记录。
> 目的：为后续自动化脚本开发提供避坑指南。

---

## 11. 文件树/变更树的交互挑战

通过 agent-browser 操作文件树或变更树打开文件时，遇到以下问题：

| 问题 | 说明 |
|------|------|
| 单击无法打开 | 文件树可能使用 `dblclick` 或特定事件处理，`find role button click` 不触发打开动作 |
| 树自动折叠 | 操作过程中树节点可能自动折叠，需要重新展开 |
| ref 频繁变化 | 树结构变化后所有 ref 编号重置，无法缓存 |
| `querySelector` 无法定位 | `ref=eXX` 是 agent-browser 虚拟引用，不是真实 HTML 属性，不能用于 CSS 选择器 |

**对策**：
- 优先使用 `find role treeitem click --name "文件名"` 尝试打开文件
- 如不生效，使用 `eval` 通过 `document.evaluate(XPath)` 或 `Array.from().find()` 定位元素
- 每次操作后重新 `snapshot -i` 获取最新 ref
- 展开树节点时使用 `Array.from().find(el => el.textContent.includes('名称'))` 配合 `dispatchEvent(new MouseEvent('click', {bubbles: true}))`

---

## 12. CSS 级联与内联样式的优先级

`scrollbar-width: none` 通过 JS `style.setProperty()` 设置为内联样式时，优先级高于所有 CSS 规则（包括 `!important`）。这会导致：
- 水平滚动条也被隐藏（`scrollbar-width` 同时控制垂直和水平）
- CSS 中的 `!important` 规则无法覆盖

**对策**：
- 避免使用 JS 内联样式控制滚动条可见性，使用 CSS class 替代
- 注意 CSS 选择器 specificity：`.a .b` (0,2,0) 高于 `.b` (0,1,0)
- 使用 `overflow-x: auto` + `overflow-y: scroll` 独立控制各轴

---

## 1. 脚本方案 vs Agent 逐步执行

| 维度 | Agent 逐步执行 | 一键脚本 |
|------|---------------|---------|
| 步骤间隔 | 每步有 3-8 秒自然延迟 | 仅靠固定 `sleep()` |
| 状态感知 | 每步后可看输出/snapshot，动态调整 | 固定流程，无法根据中间状态调整 |
| 浏览器上下文 | 复用同一 daemon 会话，上下文累积 | 每次从头开始，无历史状态 |
| 参数传递 | PowerShell 直接传递完整字符串 | `split(' ')` 拆分参数 + cmd.exe 二次解析 |

**结论**：对于依赖异步 UI 状态的测试场景，Agent 逐步执行比固定脚本更可靠。

---

## 2. 工作区加载的"冷启动"问题

`workspace.open()` + `location.reload()` 在全新浏览器实例中可能无法正确激活工作区上下文。

**根因**：
- `location.reload()` 是异步的，`eval` 命令在 reload 发起后立即返回
- reload 后应用需要重新初始化（React 渲染 → Zustand 状态恢复 → Git 状态检测）
- 全新实例的 localStorage 为空，应用无法从缓存恢复工作区状态

**对策**：增加重试机制（最多 5 次，每次间隔 3-5 秒），通过状态栏内容判断是否加载成功。

---

## 3. agent-browser daemon 超时

`close --all` 后立即执行 `open`，可能触发超时（"Operation timed out"）。

**对策**：`close --all` 后等待 2-3 秒再执行 `open`。

---

## 4. snapshot 元素定位规则

- 输出格式是 `button "名称" [ref=eXX]`，**没有** `[aria-label=...]` 属性
- 按钮名称是**中文**（如"切换左侧边栏"），不是英文
- 页面刷新后所有 ref 编号会变化，**不能硬编码 ref**
- 必须每次操作前重新 `snapshot -i` 获取最新 ref

---

## 5. `--headed` 参数导致 daemon 死锁

使用 `--headed open` 启动浏览器时，如果已有 daemon 进程在运行，可能导致新命令无限等待。

**对策**：不使用 `--headed` 参数，使用默认 headless 模式。

---

## 6. PowerShell 脚本问题

| 问题 | 说明 |
|------|------|
| 编码损坏 | PS1 文件中的中文内容在通过工具写入时可能损坏（BOM UTF-8 vs 无 BOM） |
| 引号转义地狱 | PowerShell 引号规则与嵌套 JS 代码天然冲突，需要四层转义 |
| 错误信息丢失 | `Invoke-Expression` 会吞掉原始错误信息 |

---

## 7. Node.js 脚本问题

| 问题 | 说明 |
|------|------|
| 参数拆分 | `spawnSync` 的 `command.split(' ')` 破坏含空格和特殊字符的 `eval` 参数 |
| cmd.exe 二次解析 | `shell: true` 让 cmd.exe 重新解析，嵌套引号行为不可预测 |
| 输出丢失 | `execSync` 的 `stdio: ['pipe', 'pipe', 'pipe']` 可能丢失 agent-browser 的输出 |

---

## 8. Vite Preview API 的局限性

`POST /__adl_preview_api__/workspace/open` 可在服务端打开工作区（返回 200），但：
- 不会自动更新浏览器中的 UI 状态
- 前端需要 reload 才能感知服务端变化
- 全新浏览器实例 reload 后可能仍无法恢复工作区上下文

---

## 9. Escape 键可能无法关闭菜单

`keyboard type Escape` 有时无法关闭"更多 Git 操作"的下拉菜单。可能原因是菜单组件没有监听 `keydown` 事件，而是通过 `click outside` 关闭。

**对策**：Escape 后检查菜单是否仍在，如果仍在则点击页面空白区域（如 `ref=e1`）关闭。

---

## 10. 变更文件的选择器

"文件列表"视图下的变更文件使用 `treeitem` 元素（如 `treeitem ".gitignore M 1" [ref=e53]`），而非 `.adl-change-item` CSS 类。步骤清单中的验证命令应使用 `treeitem` 选择器或直接通过 snapshot 定位。

---

## 13. CodeMirror 水平滚动条的时序问题

在"取消自动换行"模式下，CodeMirror 的 `overflow-x` 控制策略曾遇到以下问题：

| 问题 | 说明 |
|------|------|
| 构造函数时序 | `ViewPlugin` 构造函数中 `contentWidth > visibleWidth` 检测在 DOM 布局完成前返回 `false`（都是 0），导致立即隐藏滚动条 |
| 边界溢出丢失 | 内容仅超出可视区域几个字符宽度时，`+1` 容差导致溢出被忽略 |
| CSS 级联冲突 | 即使 class 设置了 `overflow-x: scroll`，`::-webkit-scrollbar { height: 0 }` 等其他规则仍可能隐藏滚动条轨道 |
| JS 内联样式覆盖 | `style.setProperty("overflow-x", "hidden", "important")` 不可逆地覆盖了 CSS 的 `scroll` 值 |

**解决方案**：采用"默认显示，确认无溢出才隐藏"的策略。
- CSS 中 `overflow-x: scroll !important` 作为默认值
- `ScrollLeftSyncPlugin.syncOverflow()` 在 no-word-wrap 模式下**完全不干预** overflow
- 构造函数只设置 CSS 变量，不检测 overflow
- 只有 word-wrap 模式下 JS 才介入隐藏滚动条

**关键原则**：对于必须始终可滚动的 UI 元素，滚动条可见性应由 CSS 决定，JS 只能从"显示"走向"隐藏"（反之会因时序问题不可靠）。

---

## 相关文件

- [变更面板测试步骤清单](./changes-panel-test-checklist.md)
- [browser-automation 规则](../../rules/browser-automation.md)
- [agent-browser 参考文档](../references/agent-browser.md)
