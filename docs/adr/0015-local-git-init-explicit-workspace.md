# 本地 Git 初始化必须显式指定工作区路径，且只创建本地 `.git`

变更面板为「非 Git 仓库」工作区提供初始化入口。同文件的 `/workspace/git/status` 与 `/workspace/git/branches` 在缺少 `workspacePath` 时会回退到当前工作区；但应用是多工作区设计，初始化动作一旦落到错误的工作区，会在用户不知情时改变另一个项目。

决定：**`workspace.initGitRepo` 必须显式接收 `workspacePath`，不回退当前工作区；只在该路径执行本地 `git init`，不联网、不添加远程、不改动现有文件；幂等，路径不是目录时拒绝。** 四端桥接（http / preview / mock / Tauri 透传）保持同一契约。

**Considered Options**: 与 status/branches 一样省略路径回退当前工作区（调用更方便，但多工作区下可能初始化错目录）；按钮只复制一段初始化提示给智能体（无新增 IPC，但需要用户手动执行）；初始化同时配置远程仓库（一步到位，但超出「本地仓库」范围，且引入网络与凭据决策）。

**Consequences**: 所有调用方必须传目标工作区路径；server 集成测试锁定「无路径 → 400 且活动工作区不产生 `.git`」与「显式路径幂等、不改现有文件」。变更面板的非 Git 空态只能对 `isRepo === false` 的工作区出现；空仓库（已有 `.git`、尚无提交）仍视为 Git 仓库（见 [GLOSSARY.md](../../GLOSSARY.md) 的「非 Git 仓库」「空仓库」「本地 Git 初始化」）。
