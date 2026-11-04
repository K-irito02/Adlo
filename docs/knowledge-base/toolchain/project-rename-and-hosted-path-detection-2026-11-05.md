# 项目改名与宿主路径探测：三条踩坑记录（2026-11-05）

关联：[progress-2026-11-04-214817.md](../../root-cause-to-close/2026-11/progress-2026-11-04-214817.md)

`AI 数字生命` → `Adlo` 的全仓改名过程中遇到三个可复现的坑，后续改名/搬目录可直接对照。

## 1. PowerShell 5.1 读无 BOM 的 UTF-8 脚本会把 CJK 读成 GBK

**现象**：批量替换里 ASCII 规则全部生效，中文规则一条都没命中，且工具不报错（其它规则有命中）。

**原因**：驱动脚本由工具写成 UTF-8 无 BOM，`powershell`（5.1）按系统代码页解码，写进 `pairs.json` 的中文变成双重编码乱码（`AI 鏁板瓧鐢熷懡`）；`replace-term.mjs` 逐字匹配自然 0 命中。

**规避**：
- 跑含 CJK 的 PowerShell 脚本一律用 `pwsh`（7）；或确保脚本带 BOM。
- 批量替换前先 dry-run，并把「每个规则的命中数」打出来；只统计「是否 OK」会漏掉这类静默失效。
- 文本替换只用仓库自带 `frontend/scripts/replace-term.mjs`（UTF-8 安全、UTF-8 无 BOM 读写），不要用 shell 内联改写。

## 2. 目录改名后 `target/` 里残留旧绝对路径

**现象**：`cargo run` 阶段报 `failed to read ...\<旧目录>\target\debug\build\tauri-<hash>\out\permissions\...`，而该路径已不存在。

**原因**：`target/debug/build/*/output` 是构建脚本的输出缓存，里面存的是**绝对路径**。目录整体搬家后这些文件跟着搬，但内容没变；cargo 认为对应单元仍是最新的，于是继续使用旧路径。

**规避**（不必 `cargo clean` 全量重建）：
```powershell
Get-ChildItem 'target/debug/build' -Directory | ForEach-Object {
  $o = Join-Path $_.FullName 'output'
  if ((Test-Path $o) -and ((Get-Content $o -Raw) -like '*<旧目录名>*')) { Remove-Item $_.FullName -Recurse -Force }
}
```
删掉这些 build 目录后重跑，构建脚本会按新路径重新生成。实测涉及 25 个目录（tauri 及其插件、若干 `-sys` crate）。

## 3. 「系统安装」探测不能看应用自己注入过的 PATH

**现象**：把 Git 来源切到「系统安装」，界面仍显示宿主副本的路径；直到把 Bash 也切成系统安装才更新。

**原因**：应用为让子进程用上宿主版本，会把宿主目录前置到自身进程 PATH；而「系统安装」的探测是 `where git` 在这个被改过的 PATH 上跑的。Bash 的宿主来源指向宿主 PortableGit 的 `bin/`，该目录**同时含 `bash.exe` 与 `git.exe`** —— 于是 `where git` 首个命中仍是宿主副本，被当成系统安装。

**修复**：`adl_env::providers::first_system_candidate` 跳过路径中含 `\env-hosted\` 段的候选（node/git/bash 共用）。同类设计要点：**任何「系统环境」探测都必须排除应用自己注入的路径**，否则「切换来源」只是界面文案。

## 附带：来源切换后的刷新成本

切换后清空整个状态缓存会让前端等一次**全量探测**（含 npm registry 联网，2–3 秒）。正确做法是只重探被切换的依赖并回填缓存（与 `/env/recheck` 同口径），实测切换后 `GET /env/status` 从 536ms 降到 3ms。
