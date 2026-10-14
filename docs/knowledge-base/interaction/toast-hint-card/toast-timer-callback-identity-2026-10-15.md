# Toast 计时器被内联回调身份抖动重置 — 2026-10-15

## 问题现象

收藏成功后顶部 toast 常驻不消失，且有跳动感；每次快消失时像被重新弹出。

## 根因分析

`Toast.tsx` 的 effect deps 为 `[duration, onClose]`，而 `onClose` 经
`ToastContainer` 内联箭头（`App.tsx`）传递——父级任何 store 更新引发的重渲染
都换 `onClose` 身份 → effect 清理重跑 → 3 秒计时器清零重走（永不到时）+
`requestAnimationFrame` 重播入场动画（跳动）。收藏后的 favicon 拉取等后台
更新恰好持续触发，症状吻合。

## 修复

`onClose` 经 `useRef` 解耦，effect 仅 deps `[duration]`，关闭时读最新回调。
单点修于 `Toast`，调用方无需改动。

## 经验

1. **effect deps 中的函数 prop 默认视为不稳定**：除非 `useCallback` 化或经 ref
   解耦，否则任何父重渲染都会重启计时器/动画/订阅。计时器类 effect 优先用
   ref 模式。
2. **"常驻 + 跳动"组合症状直指 effect 反复重跑**：先查 deps 身份，再查调用频率。
3. `ErrorToast`/`FileOpNotice` 同文件族未报障不动——修触发项，不顺手重构。
