# 设置面板窄布局与点态横条经验（2026-09-27）

来源：`docs/root-cause-resolution/2026-09/progress-2026-09-27-091456.md`（事项 4/4b/5）。

## 1. 堆叠阈值必须 ≥ 刚性控件实际宽度和，否则制造"并排死区"

- 现象：阈值 420px，但路径输入框 260px + 按钮 + gap + 卡片 padding 实际需 ~600px；420~600 区间行仍并排，label 被压到 0~54px，`<small>` 无换行约束溢出压到输入框上（视觉重叠）。
- 教训：**断点不能拍脑袋**。按公式核算：`堆叠阈值 = max(固定宽控件和 + gap + padding) + 最小可读 label`，并用 CSS 断言锁阈值存在（本轮：`@container (max-width: 600px)` + workspace-settings.test.ts）。
- 附带：组级 `align-items: center`（0-2-0）会压过堆叠档的 `stretch`（0-1-0）→ 四组行为不一致，需等价特异度逐一扳回。

## 2. SWR 进场缓存 + dirty 位：再验证不得回滚用户草稿

- 模式：模块级缓存快照首帧渲染 + 挂载后台再验证静默更新（`storageStatusCache.ts`）。
- 坑：缓存命中后用户编辑草稿，再验证返回即覆盖 → 引入 `draftsDirtyRef`：用户编辑入口（mode/input/目录选择/恢复流程）置位，再验证仅在未编辑时重播种；正/反两用例锁定（语言切换 `[t]` 重取场景）。
- 预取语义：冷填充（缓存非空即 no-op，防慢返回覆盖新快照）+ epoch 守卫（reset 后在途回写）+ 10s 超时（防 latch 卡死）。

## 3. 点态横条提取：与源头设计保持 parity 锁

- 将编辑器 `.adl-cm-hscroll`（6px 点 + 反主题高亮 + hover 展开 40px）提取为可复用 `HScrollbar` 组件；跨文件视觉复制必须加 **parity 锁测试**（两份 CSS 同断言 `min-width: 6px` / `var(--hscroll-thumb-bg)`），否则 drift 无人发现（本轮实测：parity 锁曾读错死副本）。
- 横向 reveal 轴在换用点态条后失去全部生产消费者 → 当轮删除（死代码不隔夜）。
