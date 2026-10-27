# 操作三态回显（Action Flash Triad）

行级异步操作统一走 `loading`（圆圈）→ `success`（打勾）/ `error`（打叉），回显约 1.4s 后自动复位。

## 何时用

设置行内每个独立操作（切换来源、重测、安装/卸载、复制诊断等）需要各自转圈与结果回显时。

## 用法

- 共享 hook：`frontend/src/app/components/settings/actionFlash.tsx` 的 `useActionFlash()`。
- 状态按 key 独立槽位（`Record<key, phase>` + 独立 timer），多按钮并发互不覆盖——禁止单槽位共享（2026-10 R1-ENV-01 事故）。
- 结果判定：`result === false` 或抛错判失败，其余判成功。
- 渲染走 `FlashIcon` + `button-loading-overlay.md` 的占位覆盖层。
- 同一作用域（如同一依赖行）内是否互斥，由调用方的 `disabled` 决定，hook 本身不管。

## 反例

- 禁止多个独立按钮共用一个布尔 pending（后点的会顶掉先点的圈）。
- 禁止成功/失败只 toast 不在按钮回显（用户视线在按钮上）。
