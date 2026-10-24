---
description: Windows 终端的中文编码与批量替换约束，避免 CJK 乱码、静默失效与文件损坏
alwaysApply: true
---

# 终端编码与批量替换

## 触发

在 Windows PowerShell（本仓库默认 shell）中执行含中文的批量替换、或需要阅读中文命令输出时。

## 约束

1. **禁止**在内联命令里携带中文字面量做批量替换。Windows 命令行编码会破坏 CJK，导致替换静默失效或写入乱码（历史事故：`中间区` 被改成 `心心`，4 个文件损坏后需回滚重做）。
2. 批量替换一律**写成脚本文件**（`.ps1` / `.mjs`）再执行，或使用编辑工具逐处修改。脚本内按 UTF-8 读写：`[System.IO.File]::ReadAllText/WriteAllText` + `UTF8Encoding($false)`，不要经由管道传递文本。
3. 阅读中文 diff / 日志时，用 `read` 工具读文件，或直接让 `git diff` 输出到终端；**不要**经 `Select-String` / `ForEach-Object` 管道再打印（会按 GBK 解码成乱码）。
4. 递归检索用 `grep` 工具或 `git grep`；**禁止**从仓库根 `Get-ChildItem -Recurse`（`references/`、`node_modules/`、`target/` 会让枚举超时）。需要写文件时限定具体子目录。

## 自检

- 批量替换后立即用 `git diff --stat` 与 `git grep` 复核目标字符串已归零、且没有引入新字符。
- 发现乱码先 `git checkout -- <files>` 回滚，再改用脚本文件方式重做。
