# i18n Mock 断言与浮动 Promise 陷阱（2026-09-29，恢复默认收尾实测）

## 1. 断言 mock 键名可能是恒过空断言

- 现象：`mockT` 为 Proxy（未知 key 回退 key 名），`TEMPLATES` 把 `ScopePreferences` 映射为 `'Preferences'`。
  `queryByText('settingsResetAllScopePreferences')` 查的是 key 名，而组件真渲染的是 `Preferences` ——
  渲染与否断言恒为 null，无分辨力。
- 规则：凡 mock 对 key 做了值映射，缺席断言必须查**渲染文本**而非 key 名；
  未映射 key 查 key 名才有效（依赖 Proxy 回退，需在 mock 定义处注释点破，否则后人改回退即全恒过）。
- 本轮修复：缺席断言改查 `'Preferences'` + 注释说明两处依赖（进度文案 `Resetting: Preferences` 同理）。

## 2. `void asyncHandler()` 的 rejection 无人消费

- 现象：`onClick={() => void handleConfirm()}` 中 `handleConfirm` 内部 `await onCommitted()`（调用方传 async 汇总函数），
  汇总抛错即 unhandled rejection —— `try/finally` 只保解锁，不吞 rejection。
- 规则：`void` 化的 async 入口，其内部每个 `await` 都要有归属（契约永不 reject + 注释声明，或就地 catch）。
  本轮模式：恢复已完成 → 汇总侧 `try { await onCommitted } catch {}` 后仍 `onClose()`（关框不阻塞）+ `finally` 解锁。
- 流程：新写的容错语义必须配回归测试；本轮新测试先红（暴露真实 unhandled error）后绿，证明测试有效。
  vitest 会把 unhandled rejection 单列为 Unhandled Errors —— 文件须零条。
