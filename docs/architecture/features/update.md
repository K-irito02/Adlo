# 应用更新子系统

一句话：桌面端自己检查更新、下载并安装；发布走本地脚本推到 GitHub + Gitee 双源。

## 文件地图

| 关注点 | 落点 |
| --- | --- |
| 多源结论合并、说明裁剪、版本择优（纯逻辑 + 单测） | `adlo/crates/update/src/lib.rs` |
| 检查 / 下载 / 安装三条命令，进度事件，代理接入，`on_before_exit` 收尾 | `adlo/src-tauri/src/commands/update.rs` |
| updater 插件注册、公钥与 endpoints、NSIS 钩子声明 | `adlo/src-tauri/tauri.conf.json` |
| 安装前结束 sidecar（避免 `adl-server.exe` 文件锁） | `adlo/src-tauri/installer-hooks.nsh` + `adl_server.rs::terminate` |
| 前端桥接（Tauri / HTTP stub / mock） | `frontend/src/shared/ipc/update.ts`、`tauri-bridge/tauri-update.ts`、`mock/mock-update.ts` |
| 状态机（检查节流、跳过版本、下载/安装、错误分流） | `frontend/src/app/stores/slices/appUpdateSlice.ts` |
| 通知卡片与铃铛绿点 | `frontend/src/app/features/update/UpdateNotificationCard.tsx`、`regions/TitleBarNotifications.tsx` |
| 关于页入口与失败文案 | `frontend/src/app/features/about/AboutSettings.tsx` |
| 发布脚本（bump / build / publish / verify） | `adlo/scripts/release.mjs`、`adlo/scripts/release/manifest.mjs` |
| 决策记录 | `docs/adr/0026`（双源 + 官方 updater）、`0027`（不设确认弹窗）、`0028`（只走本地脚本） |
| 发版技能 | `.agents/skills/adlo-release/SKILL.md` |

## 快速判断

- 客户端「收不到更新」：先看两个清单 URL 是否 200、版本号是否与 `tauri.conf.json` 一致（`pnpm --dir adlo run release:verify -- --tag vX.Y.Z`）。
- 单源故障不应导致失败：`adl_update::decide` 的语义是「有更新取最高 / 任一源说已是最新即已是最新 / 全不可用才失败」。
- 安装报文件锁：`installer-hooks.nsh` 必须被注入（`release:build` 会在构建后断言 `installer.nsi` 含该 include）。
