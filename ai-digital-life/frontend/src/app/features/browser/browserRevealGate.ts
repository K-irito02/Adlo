/**
 * 浏览器 WebView2「首帧揭示门控」。
 *
 * 原生子 WebView2 创建时位于屏外（`attach_webview_child` 以 -10000 放置），其可见性
 * 完全由前端 `setTabBounds`（把边界设到容器矩形）决定。若在页面尚未渲染出内容时就
 * 应用边界，原生死区/空白首帧会露出（本地服务未就绪、切换主题、最大化等场景会看到
 * 白/黑闪一下，并看见窗口「放大」）。
 *
 * 因此新建 WebView2 后先登记为「待揭示」：门控期间 `updateWebViewBounds` 跳过，
 * WebView2 保持屏外（此时显示的是加载动画）；等页面就绪（首个元数据事件）或超时后
 * 解除门控并应用边界，实现「加载动画 → 内容」的无缝替换。
 *
 * 采用带截止时间的 Map：即使持有定时器的宿主已卸载（未触发揭示），条目也会在截止后
 * 自动失效，避免把标签永久锁在屏外。
 */
const pending = new Map<string, number>();

/** 登记 tab 为待揭示，`maxMs` 后自动失效（兜底，防止永久屏外）。 */
export function markRevealPending(tabId: string, maxMs: number): void {
  pending.set(tabId, Date.now() + maxMs);
}

/** 该 tab 是否仍在待揭示窗口内（到期即自动清除并返回 false）。 */
export function isRevealPending(tabId: string): boolean {
  const deadline = pending.get(tabId);
  if (deadline === undefined) {
    return false;
  }
  if (Date.now() >= deadline) {
    pending.delete(tabId);
    return false;
  }
  return true;
}

/** 解除 tab 的待揭示门控（页面就绪或超时揭示时调用）。 */
export function clearRevealPending(tabId: string): void {
  pending.delete(tabId);
}

/** 测试专用：清空门控状态。生产代码不得调用。 */
export function resetRevealGateForTest(): void {
  pending.clear();
}
