# Harness 版本管理收敛为通用层，取消安装包内置版本

dsh 与 OpenCode 共用同一套版本内核（版本目录、选中/回退/卸载、安装任务、来源解析、目录限量），差异用「每工具一个薄描述符」表达；DSH 特有的端口、运行态与 auth 留在 dsh 层。安装包不再预置任何 harness 版本，`dsh-bundle`、`bundledVersion`、`prefer_offline` 一并删除：OpenCode 是每平台约 202MB 的单文件二进制，内置会让安装包增大约 60–80MB 且每次发版都要重打包。改为首启 harness 向导按需下载（点击安装、来源自动检测、失败不阻塞、手动重试）；DSH 稳定桶为空时回退 `latest` 标签。

**Considered Options**: 只给 OpenCode 做首启下载、DSH 继续内置——两套预置语义并存，且保留已无必要的收编链路；或把 OpenCode 也塞进安装包——体积与发版成本不可接受。
