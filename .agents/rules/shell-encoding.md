---
description: Windows 终端的中文编码与批量替换约束，避免 CJK 乱码、静默失效与文件损坏
alwaysApply: true
---

# 终端编码与批量替换

## 触发

在 Windows PowerShell（本仓库默认 shell）中执行含中文的批量替换、或需要阅读中文命令输出时。

## 约束

1. **禁止**用 shell 内联命令对源码/文档做批量文本修改（`-replace`、`Add-Content`、here-string、`sed`、`node -e`/`node -p` 写文件、`perl -pi` 等），**不限是否含中文**。历史事故：中文字面量被破坏（`中间区` → `心心`，4 个文件损坏）；注释被写入字面量 `\n`、import 块残留空行（2026-10-25，多轮人工审查才发现）。
2. 正文修改一律用 `edit` 工具逐处改。确需批量时**写成脚本文件**（`.mjs` / `.ps1`）再执行；**禁止用 `node -e`/`node -p` 内联 `fs.writeFileSync`/`appendFileSync`/`createWriteStream` 写文件**；脚本内按 UTF-8 读写（`[System.IO.File]::ReadAllText/WriteAllText` + `UTF8Encoding($false)`），不要经管道传递文本。跨文件统一改名优先用 `frontend/scripts/replace-term.mjs --pairs <json>`（精确匹配、零命中即失败，含 fixture 单测）。
3. 阅读中文 diff / 日志：先 `git diff --output=<file>`（或 `git show > 文件`）落盘，再用 `read` 打开；**不要**依赖终端回显或 `Select-String` / `ForEach-Object` 管道（本机按 GBK 解码，必出乱码）。
4. 递归检索用 `grep` 工具或 `git grep`；**禁止**从仓库根 `Get-ChildItem -Recurse`（`references/`、`node_modules/`、`target/` 会让枚举超时）。需要写文件时限定具体子目录。
5. 批量修改后必须自检：`git diff --check`、`node ai-digital-life/scripts/check-source-hygiene.mjs`、`pnpm --dir ai-digital-life run scripts:format:check`。hygiene 同时拦截 U+FFFD / BOM / 常见 mojibake，以及未发布阶段的「兼容历史」代码（外部协议用 `compat-allow: <理由>` 显式豁免）。
6. `git diff --output=<file>` 必须写在 `--` 之前（`git diff HEAD --output=<file> -- <path>`）；写在 `--` 之后会被当作 pathspec，快照落空还刷屏（2026-10-27，49 个快照重跑）。
7. 中文命令输出在工具回显里按 GBK 解码必乱码：凡需断言中文内容，一律落盘后用 `read` / `grep` 验，不看回显。
8. **日志回显不可作证据**：WDIO / PowerShell 输出中的中文标题会在回显里被截断（如 `Could not find window with title containing "�?`），判断窗口标题、错误文案时必须用 `read` 打开日志文件确认，不要据此猜值或下结论。 <!-- hygiene-allow: intentional mojibake sample -->

## 自检

- 批量修改后立即用 `git diff --stat` 与 `git grep` 复核目标字符串已归零、且没有引入新字符；再跑第 5 条的三项检查。
- 发现乱码先 `git checkout -- <files>` 回滚，再改用脚本文件方式重做。
