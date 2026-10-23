# Node.js 运行时（env-node）

## 症状

- 助手进程无法启动，或启动后立即退出，日志提示需要 Node.js。
- 「环境」设置组的 Node 行显示「需安装」或「版本过低」，来源为 `none`。

## 检测命令

```powershell
node --version
where.exe node
```

把输出与设置组行内的基线版本对比：低于基线或找不到命令即未就绪。
宿主托管的版本位于应用数据目录下的 `env-hosted/node/installed/<版本>/`。

## 安装步骤

优先走宿主自动安装：在 Node 行点「安装」并确认，由宿主下载、校验、解压。

需要手工安装时只使用官方包：

1. 打开 Node.js 官方下载页 https://nodejs.org/en/download ，在 LTS 区选择 Windows x64 的 zip 包（`node-v*-win-x64.zip`）。
2. 安装与应用显示的基线版本一致（当前 24.x LTS）：版本以「环境」设置组 Node 行展示的基线为准，不要凭记忆选版本。
3. 校验完整性：在同一目录下载 `SHASUMS256.txt`，执行
   `certutil -hashfile <zip 文件> SHA256`，与清单中对应行比对。
4. 解压到自选目录，记下其中 `node.exe` 的完整路径。

## 装后回填

- 宿主安装：等待任务完成，设置组会自动刷新；也可以点「重新检测」。
- 手工安装：在 Node 行「手动路径」填入 `<解压目录>\node.exe`，失焦保存后点「重新检测」。

## 回滚

- 宿主来源：在 Node 行点「卸载」（两段确认），对应目录 `env-hosted/node/installed/<版本>/` 会被删除。
- 手动路径：清空「手动路径」，再点行内复位按钮让来源回到自动。
