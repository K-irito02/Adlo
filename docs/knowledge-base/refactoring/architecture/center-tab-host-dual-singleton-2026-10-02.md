# 中心标签宿主：单例 Hook 双宿主化经验（2026-10-02）

来源：中心标签宿主功能（spec `docs/superpowers/specs/2026-10-01-center-tab-host-design.md`）。

## 1. 单例设计的 Hook 不能直接实例化两次

`useBrowserPool`（组件内 `useRef` 池）与 `useTerminalPtyLifecycle`（每实例 refs + 全局副作用）都按单例设计。中心宿主需要第二实例时：
- 浏览器池：把成员集/`creating` 守卫/版本号提升为模块级单例，各宿主只保留 per-host 的活动标签/bounds/可见性 refs。
- 终端 PTY：输出订阅、历史采集、30s 检查点、beforeunload、Tauri 关闭落盘必须全局仅一次；订阅回调读写的 refs 收敛到单例 runtime；并移除 `activeRightTool === 'terminal'` 门控（输出写入 pooled xterm + 归档是全局工作）。

## 2. 位置排他 + 破坏性操作的位置过滤

浏览器/终端标签加排他的 `location: 'panel' | 'center'`。面板的关闭/清空/删除/工作区移除、池销毁、PTY 回收、书签清理必须**全部**按位置过滤——只改 store 不改清理链会留下“store 保留但 WebView/PTY/书签被毁”的半吊子状态。关闭中心标签要走完整销毁（`browserPool.destroyTab` / PTY kill）否则泄漏原生 WebView。

## 3. 退役 WebView 前先证伪其 IPC 依赖

删除 `adl-dsh-view-main` 专属视图前，用三条证据确认 dsh 页面不依赖 loopback Tauri IPC：`tauri.conf.json` 的 `withGlobalTauri: false`（`__TAURI__` 永不注入）、注入脚本的 `__TAURI__` 守卫永不触发、旧授权仅 `core:default` 且从未授予 ADL 命令。结论成立才可删除能力文件；否则把 `http://127.0.0.1:*` 并入浏览器能力会扩大全部 loopback 标签的 IPC 面。

## 4. 红绿 + 审查循环抓住了真缺陷

本轮证明有效的门：失败测试先行（`centerActiveTabId` 重夹、中心过滤、池回收）、任务审查、终审（4 Critical）、收尾多 Agent 审查（78 项中分诊出真缺口）。`require()` 进 Vitest ESM、`pnpm --dir frontend npm --` 笔误等计划缺陷靠复评发现。
