# ToastCard 统一 + hover 按钮显隐 + 两阶段收起动画

> 2026-08-16 — 统一右下角提示卡片（ErrorToast 复用 ToastCard、删除重复 CSS、hover 显隐按钮、平滑收起动画）中沉淀的可复用经验。

## 背景

右下角存在两套外观几乎一致但样式各自独立的卡片系统：ErrorToast（`.error-toast`）与 ToastCard（`.toast-card`）。ErrorToast 的收起/复制按钮始终可见，ToastCard 已有 hover 显隐；展开/收起动画有"伸缩感/挤压感/跳动感"。方案：组件统一 + hover 显隐 + 平滑动画。

## 经验 1：统一组件外壳，避免平行卡片系统

### 方案

ErrorToast 卡片内部改为渲染 `<ToastCard>`（tone/icon/title/detail/onDismiss/role/ariaLive 映射），title 映射与 level 解析保留在 ErrorToast 容器；删除重复的 `error-toast.css` / `file-op-notice.css` 与卡片级 JSX。

右下角改为**单一固定区域容器** `ToastRegion`（`createPortal` 到 body 的 `.toast-card-region`），内嵌两个 `role="region"` + aria-label 的 group（error 组 / notice 组）：

- 避免两个 `position: fixed` 同位区域重叠碰撞（两类卡片同时出现时相互覆盖）
- 区域 `flex-direction: column-reverse` → error 组贴屏幕边缘、notice 组在上；组内再 column-reverse 保持"最新在上、最老贴边"
- `pointer-events` 两级透传（region/group `none`，卡片自身 `auto`）
- group 仅在列表非空时暴露 `role="region"`（空态不播报空 landmark）；group div 恒渲染以稳定 AnimatePresence 退出动画

### 教训

- 相似组件出现第二份时优先"复用外壳"而非"复制样式"，否则 hover/显隐等行为各自漂移。
- 多张固定卡片共用一个区域容器，避免多个同位 fixed 区域。

## 经验 2：hover-only 按钮用按钮自身 `:focus-visible`，禁止容器 `:focus-within`

### 问题

`.toast-card:focus-within` 显示收起/复制按钮 → **鼠标点击按钮后按钮保持聚焦**，`:focus-within` 持续命中，鼠标移出卡片按钮仍不消失。

### 方案

```css
.toast-card:hover .toast-card__btn--detail,
.toast-card__btn--detail:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
```

鼠标点击不触发按钮的 `:focus-visible`（仅键盘 Tab 聚焦触发），移出卡片按钮正确隐藏；键盘无障碍保留。

### 教训

- `:focus-within` 是"容器内任意元素聚焦"（含鼠标点击聚焦），`:focus-visible` 才是"键盘等显式焦点"。hover-revealed 按钮的键盘可见性必须用按钮自身 `:focus-visible`。

## 经验 3：两阶段收起动画（实测高度 + transitionend 门控省略号）

### 问题

收起动画"跳动感"的两个跳变源：

1. `max-height` 60em→1.5em 过渡伪影：可视内容约 4.5em，前 ~190ms 无变化、接近末尾才瞬间收缩 → "延迟后猛缩"
2. 收起瞬间切换 `white-space: nowrap`：文本从多行瞬间重排为单行 → 内容跳变

### 方案

```tsx
// ToastCard.tsx 关键状态
const [collapsedSettled, setCollapsedSettled] = useState(false);
const [detailHeight, setDetailHeight] = useState<number | null>(null);
const measureDetail = useCallback(() => {
  const el = detailRef.current;
  if (!el) return;
  const next = el.scrollHeight;          // 幂等：值未变不 setState
  if (next !== detailHeightRef.current) setDetailHeight(next);
}, []);

// 折叠动画结束后才应用单行省略
const handleDetailTransitionEnd = (e) => {
  if (e.target !== detailRef.current) return;
  if (!expanded && e.propertyName === 'max-height') setCollapsedSettled(true);
};
```

- **展开**：内联 `max-height: <实测 scrollHeight>px`（消除 60em 伪影）
- **收起**：内联 `max-height: calc(var(--text-xs) * var(--leading-normal))`（= 单行 18px，行高解耦）
- 动画期间保持 `white-space: pre-wrap`（逐行裁剪平滑收缩）；`transitionend`（`propertyName === 'max-height'`）后才加 `is-collapsed-settled`（nowrap + ellipsis）
- 切换收起/展开时重置 `collapsedSettled`；中途反切时旧 transition 发 `transitioncancel` 而非 `transitionend`，不会误置 settled
- **兜底重测**：detail 被自身 max-height 封顶 + overflow hidden 时，内容变高不改盒尺寸 → ResizeObserver 静默。补 `document.fonts.ready` + window resize（rAF 节流）兜底，经 `collapsedSettledRef` 门控（折叠已 settled 不重测，避免 nowrap 单行高度污染展开值）
- 折叠高度用 `calc(var(--text-xs) * var(--leading-normal))` 而非硬编码 `1.5em`，行高调整不失效

### 教训

- `max-height` 动画的目标值应取**实际内容高度**而非随意大值，否则有"延迟后猛缩"伪影。
- 高度动画期间不能同时切换会改变文本布局的属性（nowrap/overflow），应拆成"动画态 + settled 态"两阶段。
- ResizeObserver 观察被自身 max-height 封顶的元素会静默：内容长高不改盒尺寸 → RO 不触发，需 fonts.ready/resize 兜底。
- `scrollHeight` 在元素被 max-height + overflow:hidden 裁剪时仍返回完整内容高度（可用于测量）。

## 相关文件

- 组件：`frontend/src/app/components/ToastCard.tsx`、`ErrorToast.tsx`、`FileOpNotice.tsx`、`ToastRegion.tsx`
- 样式：`frontend/src/styles/components/toast-card.css`（`.toast-card-region` / `.toast-card-region__group` / `.toast-card__detail.is-collapsed-settled`）
- 测试：`frontend/src/app/components/__tests__/ErrorToast.test.tsx`、`ToastRegion.test.tsx`
- 相关旧经验：[error-toast-severity-scope-popLayout-2026-08-12.md](./error-toast-severity-scope-popLayout-2026-08-12.md)（popLayout 部分已随本变更调整：卡片级不再设 layout，仅摘要卡保留）
