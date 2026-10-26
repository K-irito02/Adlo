---
dep: git-bash
baseline: 2.56.0
detect: git --version ; where.exe git ; bash --version ; where.exe bash
---

# Git 与 Bash（env-git-bash）

## 症状

- Git 面板为空、分支与 diff 不可用，或终端里 Bash 不可选。
- 「环境」设置组 Git / Bash 行显示「需安装」或「需手动安装」，来源为 `none`。

## 检测命令

```powershell
git --version
where.exe git
bash --version
where.exe bash
```

Bash 的可用来源（**MinGit 不含 Bash**，宿主一键安装只装 Git）：

- 系统完整 Git for Windows（完整安装包自带）：`<Git 安装目录>\bin\bash.exe`
- WSL：`%SystemRoot%\System32\bash.exe`
- MSYS2：`<MSYS2 安装目录>\usr\bin\bash.exe`
- 指定路径：用户自备的任意 `bash.exe`（来源下拉选「指定路径」后填写）

输出与设置组行内基线对比，低于基线或找不到命令即未就绪。

## 安装步骤

优先走宿主自动安装：在 Git 行点「安装」并确认。宿主安装的是 **MinGit**，只提供
Git，**不含 Bash**；需要 Bash 时请从下面三种真实来源选一种：

1. 安装**完整** Git for Windows（`Git-*-64-bit.exe`，非 MinGit），用其自带
   `<Git 目录>\bin\bash.exe`。
2. 启用 WSL（`wsl --install`），用 `%SystemRoot%\System32\bash.exe`。
3. 安装 MSYS2，用 `<MSYS2 安装目录>\usr\bin\bash.exe`。

需要手工安装 Git 时只使用官方包：

1. 打开 Git for Windows 官方发布页 https://github.com/git-for-windows/git/releases 。
2. 下载 `MinGit-*-64-bit.zip`（轻量，只有 Git）或 `Git-*-64-bit.exe`（完整安装包，含 Bash）。
3. 校验完整性：发布页附带 `.sha256` 文件，执行
   `certutil -hashfile "<下载文件>" SHA256`，与清单比对。
4. 解压或安装到自选目录，记下 `cmd\git.exe` 的完整路径；只有完整安装包才有
   `bin\bash.exe`（MinGit 没有）。

## 装后回填

- 宿主安装：等待任务完成，设置组会自动刷新；也可以点「重新检测」。
- 手工安装：Git 行 / Bash 行分别在来源下拉选「指定路径」，在出现的输入框填
  `<Git 目录>\cmd\git.exe` / `<Git 目录>\bin\bash.exe`，失焦保存后点「重新检测」。

## 回滚

- 宿主来源：在 Git 行点「卸载」（两段确认），对应目录 `env-hosted/git/installed/<版本>/` 会被删除。
- 指定路径：在两行来源下拉中选回「自动检测」即可（已填路径保留，仅隐藏）。
- WSL / MSYS2 由各自渠道管理，本应用不卸载，回退时把 Bash 来源切回自动即可。
