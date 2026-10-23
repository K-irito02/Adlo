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

Bash 的三类来源可这样辨认：

- Git for Windows 自带：`<Git 安装目录>\bin\bash.exe`
- WSL：`%SystemRoot%\System32\bash.exe`
- MSYS2：`<MSYS2 安装目录>\usr\bin\bash.exe`

输出与设置组行内基线对比，低于基线或找不到命令即未就绪。

## 安装步骤

优先走宿主自动安装：在 Git 行点「安装」并确认。Bash 随 Git 共生，无需单独安装。

需要手工安装时只使用官方包：

1. 打开 Git for Windows 官方发布页 https://github.com/git-for-windows/git/releases 。
2. 下载 `MinGit-*-64-bit.zip`（轻量，够用）或 `Git-*-64-bit.exe`（完整安装包）。
3. 校验完整性：发布页附带 `.sha256` 文件，执行
   `certutil -hashfile "<下载文件>" SHA256`，与清单比对。
4. 解压或安装到自选目录，记下 `cmd\git.exe` 与 `bin\bash.exe` 的完整路径。

## 装后回填

- 宿主安装：等待任务完成，设置组会自动刷新；也可以点「重新检测」。
- 手工安装：Git 行「手动路径」填 `<Git 目录>\cmd\git.exe`，Bash 行填
  `<Git 目录>\bin\bash.exe`，失焦保存后点「重新检测」。

## 回滚

- 宿主来源：在 Git 行点「卸载」（两段确认），对应目录 `env-hosted/git/installed/<版本>/` 会被删除。
- 手动路径：清空两行「手动路径」，再点行内复位按钮让来源回到自动。
- WSL / MSYS2 由各自渠道管理，本应用不卸载，回退时把 Bash 来源切回自动即可。
