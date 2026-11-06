# 标题栏溢出辅助：拖拽车道与两端渐隐（2026-11-07）

> 场景：标题栏右侧收敛（移除主题/语言按钮）、新增 24px 拖拽车道、“+” 跟随最后一个标签并在溢出时 sticky 固定、标签条两端 24px 渐隐模糊。

## 1. sticky 覆盖层不能靠 `scroll-padding` 让位

`scroll-padding-right` 只在滚动容器**需要滚动**时生效。活动标签是最后一个标签时，它已经位于滚动末端（`scrollLeft` 已到最大值），此时再大的 `scroll-padding` 也不会把它向左推——`scrollIntoView({ inline: 'nearest' })` 看到元素已在视口内就不会动作。

**结论**：覆盖层（本例的 24px 右渐隐）不要试图用“预留滚动空间”解决“遮住关闭按钮”。正确做法是把覆盖层放到**操作按钮之下**：

```css
.adl-center-tab-strip__fade-right { z-index: var(--z-base); } /* 0 */
.adl-center-tab__actions { z-index: 2; }                        /* 按钮画在渐隐之上 */
.adl-center-tab-strip__add { z-index: var(--z-raised); }        /* 10，按钮本身可点 */
```

渐隐仍会压暗标签文字（预期），但关闭按钮始终可见、可点。

## 2. 层级顺序要按“谁必须可点”排

| 层 | 取值 | 理由 |
|----|------|------|
| 标签内容 / 两端渐隐 | `--z-base`(0) | 只做视觉遮罩 |
| 标签操作按钮 | 2（既有） | 必须高于渐隐，不能被压暗 |
| sticky「+」 | `--z-raised`(10) | 必须高于操作按钮，避免点穿到隐藏标签的关闭按钮 |
| 被拖拽标签 | `--z-dropdown`(20) | 拖拽提起项必须在最上层 |

> 反例：曾把「+」提到 `--z-sticky`(30)，结果拖到最右时盖住被拖标签。

## 3. 渐隐层跟随「+」移动 + 隐藏不要淡出

「+」在溢出时 sticky 于滚动区右端，非溢出时跟随最后一个标签。右渐隐若做成「+」的 `::before`，会随「+」一起移动；改成独立元素时需用 `right: calc(var(--space-2) + 22px)` 对齐按钮宽度。非溢出态「+」离开右缘，若渐隐层仍在做 200ms opacity 淡出，会留下错位残影：

```css
.adl-center-tab-strip[data-fade-right='false'] .adl-center-tab-strip__fade-right {
  transition: none; /* 隐藏瞬时，显示仍可淡入 */
}
```

## 4. 选中底色不要走颜色过渡

标签 `transition: transform, colors` 会让“旧选中底淡出 + 新标签底瞬时出现”重叠成拖影。把过渡收敛为仅 `transform`，选中态切换即瞬时完成。

## 5. 溢出判定与测试

- 右溢出：`scrollLeft + clientWidth < scrollWidth - 1`
- 左溢出：`scrollLeft > 1`
- 更新时机：`onScroll` + `ResizeObserver` + 标签数量变化
- jsdom 可用 `Object.defineProperty` 伪造 `scrollWidth/clientWidth/scrollLeft` 后 `fireEvent.scroll`，锁定 `data-fade-left/right` 四态；sticky 与像素宽度只能靠真实 Chromium/WebView 渲染验证。
