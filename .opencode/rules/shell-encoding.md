---
description: Windows 终端的中文编码与批量替换约束，避免 CJK 乱码、静默失效与文件损坏
alwaysApply: true
---

# 终端编码与批量替换

## 触发

在 Windows PowerShell（本仓库默认 shell）中执行含中文的批量替换、或需要阅读中文命令输出时。

## 约束

1. **禁止**用 shell 内联命令对源码/文档做批量文本修改（`-replace`、`Add-Content`、here-string、`sed`、`node -e`/`node -p` 写文件、`perl -pi` 等），**不限是否含中文**。历史事故：中文字面量被破坏（`中间区` → `心心`，4 个文件损坏）；注释被写入字面量 `\n`、import 块残留空行（2026-10-25，多轮人工审查才发现）。
   - 只是内存里的路径/字符串归一化（不写文件）也别用 `-replace`：`.opencode/opencode.json` 按子串拒绝整条命令；用 `.Replace()` / `Join-Path` / `[System.IO.Path]::Combine`。
2. 正文修改一律用 `edit` 工具逐处改。确需批量时**写成脚本文件**（`.mjs` / `.ps1`）再执行；**禁止用 `node -e`/`node -p` 内联 `fs.writeFileSync`/`appendFileSync`/`createWriteStream` 写文件**；脚本内按 UTF-8 读写（`[System.IO.File]::ReadAllText/WriteAllText` + `UTF8Encoding($false)`），不要经管道传递文本。跨文件统一改名优先用 `frontend/scripts/replace-term.mjs --pairs <json>`（精确匹配、零命中即失败，含 fixture 单测）。
   - **运行含 CJK 的 `.ps1` 一律用 `pwsh`**：`powershell`（5.1）按系统代码页解码无 BOM 的 UTF-8，在内存里就会损坏中文字面量（2026-11-04 实测：批量替换的中文规则全部静默失效）。仓库脚本自身也不得用 `powershell -File` 调用。
   - `pairs.json` 的规则应加 `minHits`：给出「这条规则至少应命中多少处」，避免某条规则因编码/拼写问题静默 0 命中而整体仍报 OK。
3. 阅读中文 diff / 日志 / **源码文件**：先 `git diff --output=<file>`（或 `git show > 文件`）落盘，再用 `read` 工具打开；源文件同理只用 `read` 工具。**不要**用 `Get-Content` / `type` / `cat` 回显或 `Select-String` / `ForEach-Object` 管道（本机按 GBK 解码，必出乱码）。
   - **禁止从 shell 回显重建文件内容再整文件覆盖**（2026-11-12：用 `Get-Content` 读取中文 README 后凭乱码重写，险些损坏被跟踪文档，最终 `git checkout --` 回滚）。任何「读出来再写回去」的动作，必须用 `read` 拿原文、`edit`/`write` 改。
4. 递归检索用 `grep` 工具；`rg`（v15，`D:\Tools\ripgrep\bin\rg.exe`，已在用户 PATH）只用于**纯 ASCII** 的批量列文件/计数，中文检索仍走 `grep` 工具。**禁止** `git grep` 与 `Select-String`；**禁止**从仓库根 `Get-ChildItem -Recurse`（`references/`、`node_modules/`、`target/` 会让枚举超时）。需要写文件时限定具体子目录。
5. 批量修改后必须自检：`git diff --check`、`node adlo/scripts/check-source-hygiene.mjs`、`pnpm --dir adlo run scripts:format:check`。hygiene 同时拦截 U+FFFD / BOM / 常见 mojibake，以及未发布阶段的「兼容历史」代码（外部协议用 `compat-allow: <理由>` 显式豁免）。
6. `git diff --output=<file>` 必须写在 `--` 之前（`git diff HEAD --output=<file> -- <path>`）；写在 `--` 之后会被当作 pathspec，快照落空还刷屏（2026-10-27，49 个快照重跑）。
7. 中文命令输出在工具回显里按 GBK 解码必乱码：凡需断言中文内容，一律落盘后用 `read` / `grep` 验，不看回显。
   - **降低回显乱码（推荐）**：会话开始时执行一次 `chcp 65001 > $null; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)`，再跑长命令；若仍出现 `�`，按上一条落盘核对，不要据乱码猜文案或计数。 <!-- hygiene-allow: intentional U+FFFD sample -->
8. **日志回显不可作证据**：WDIO / PowerShell 输出中的中文标题会在回显里被截断（如 `Could not find window with title containing "�?`），判断窗口标题、错误文案时必须用 `read` 打开日志文件确认，不要据此猜值或下结论。 <!-- hygiene-allow: intentional mojibake sample -->

## 自检

- 批量修改后立即用 `git diff --stat` 与 `grep` 工具复核目标字符串已归零、且没有引入新字符；再跑第 5 条的三项检查。
- 发现乱码先 `git checkout -- <files>` 回滚，再改用脚本文件方式重做。

## 红牌（命中即停）

- 从 shell 回显里抄中文、路径或数字写进文件。
- 用 `Get-Content` / `type` / `cat` 读源码或文档正文。
- 用 `rg -n` / `Select-String` / `git grep` / `findstr` 做内容检索。
- 从仓库根 `Get-ChildItem -Recurse` 枚举文件（改用 `glob` 工具）。
