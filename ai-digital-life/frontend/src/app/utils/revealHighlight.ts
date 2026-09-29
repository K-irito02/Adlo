/**
 * 主内容显示区域「落点高亮」的共享驱动逻辑（右侧面板通用，无 React 依赖）。
 *
 * 呈现：一条**横向铺满**的高亮条（直角 + 左侧 3px 竖线 + 淡色底），短暂淡出后消失；
 * 用于「跳转/检索命中后指出落点」。同一份实现在不同面板只换配色变体：
 * - `warning`：文件面板「检索文件 → 预览」的落点（警示黄）；
 * - `accent`：设置面板「搜索设置 → 跳转」的落点（主题蓝）。
 *
 * 结构（宿主内**常驻**，由本模块按类名查找并驱动，避免各消费方各自拼 DOM）：
 * 宿主 + `RevealHighlightLayers`（见 `@components/RevealHighlight`）。
 *
 * 为何必须用覆盖层而非给目标元素加背景：宿主内的滚动列普遍带左右内边距，
 * 且**该列自身就是滚动容器**（`overflow-y: auto` 使 `overflow-x` 计算值为 auto，会裁剪内部溢出），
 * 块级背景物理上到不了宿主边缘。视口夹层则把高亮条裁在宿主可视区内，
 * 既不越界、也不会给宿主制造可滚动溢出。
 */
export const REVEAL_HIGHLIGHT_CLASS = 'adl-reveal-highlight';
export const REVEAL_HIGHLIGHT_VIEWPORT_CLASS = 'adl-reveal-highlight-viewport';

/** 配色变体：只换 CSS 变量来源，几何、时长、关键帧完全共用。 */
export type RevealHighlightVariant = 'warning' | 'accent';

const ACTIVE_CLASS = 'is-active';
/** 高亮时长（单一来源）：写入 `--adl-reveal-highlight-duration`，CSS 关键帧与清除定时器共用同一值。 */
export const REVEAL_HIGHLIGHT_DURATION_MS = 1400;
/** CSS 自定义属性名：由本模块注入，避免 TS 与 CSS 各写一份时长导致漂移。 */
const DURATION_VAR = '--adl-reveal-highlight-duration';

interface HighlightTracking {
  raf: number;
  timer: number;
}

/** WeakMap 跟踪：连续跳转时旧定时器/rAF 不得撕掉新加的类。 */
const highlightTracking = new WeakMap<HTMLElement, HighlightTracking>();

function findOverlay(host: HTMLElement): HTMLElement | null {
  return host.querySelector<HTMLElement>(`.${REVEAL_HIGHLIGHT_CLASS}`);
}

function stopTracking(overlay: HTMLElement): void {
  const tracking = highlightTracking.get(overlay);
  if (!tracking) {
    return;
  }
  window.clearTimeout(tracking.timer);
  window.cancelAnimationFrame(tracking.raf);
  highlightTracking.delete(overlay);
}

/**
 * 把高亮条对齐到目标元素。高亮条的 offsetParent 是**不滚动**的视口夹层（矩形与宿主一致），
 * 而被定位的元素位于其内部滚动列中，故须按视口矩形差实时计算（滚动过程中每帧跟踪）。
 * 目标已脱离文档（切换文件/切组后旧节点被替换）或夹层不可测时**立即收起高亮条** ——
 * 既不压成错误位置，也不让它冻结在旧像素位置（冻结会留下一条错位的色带）。
 *
 * 判定用 `offsetParent === null` 而非 `instanceof HTMLElement`：同样表达「无可测的定位祖先」，
 * 但不必引用浏览器全局构造器 —— 逐帧回调可能落在宿主页面/测试环境已拆解之后，
 * 此时任何全局引用都会抛错，而属性读取不会。
 */
function alignOverlay(overlay: HTMLElement, target: HTMLElement): void {
  const anchor = overlay.offsetParent;
  if (anchor === null || !target.isConnected) {
    if (overlay.style.height !== '0px') {
      overlay.style.height = '0px';
    }
    return;
  }
  const anchorRect = anchor.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = `${targetRect.top - anchorRect.top}px`;
  const height = `${targetRect.height}px`;
  if (overlay.style.top !== top) {
    overlay.style.top = top;
  }
  if (overlay.style.height !== height) {
    overlay.style.height = height;
  }
}

/** 立即收起宿主内的落点高亮（面板卸载 / 下一次跳转前调用；宿主无覆盖层时无操作）。 */
export function clearHighlight(host: HTMLElement | null): void {
  const overlay = host ? findOverlay(host) : null;
  if (!overlay) {
    return;
  }
  stopTracking(overlay);
  overlay.classList.remove(ACTIVE_CLASS);
  overlay.style.height = '0px';
}

/**
 * 播放一次落点高亮：对齐目标元素并随滚动跟踪（连点可重放）；返回宿主是否具备覆盖层。
 * 覆盖层缺席（宿主未渲染 `RevealHighlightLayers`）时静默无操作 —— 定位由调用方负责，
 * 此处只呈现，不越权接管滚动。
 */
export function highlightElement(
  host: HTMLElement,
  target: HTMLElement,
  options: { variant: RevealHighlightVariant; durationMs?: number },
): boolean {
  const overlay = findOverlay(host);
  if (!overlay) {
    return false;
  }
  stopTracking(overlay);
  overlay.classList.remove(ACTIVE_CLASS);
  // 变体与时长都在这里落定：先摘旧的变体类，避免上一次的配色残留到本次。
  overlay.classList.toggle(`${REVEAL_HIGHLIGHT_CLASS}--warning`, options.variant === 'warning');
  overlay.classList.toggle(`${REVEAL_HIGHLIGHT_CLASS}--accent`, options.variant === 'accent');
  const duration = options.durationMs ?? REVEAL_HIGHLIGHT_DURATION_MS;
  overlay.style.setProperty(DURATION_VAR, `${duration}ms`);
  alignOverlay(overlay, target);
  // 强制重排以便连续跳转时动画可重放
  void overlay.offsetWidth;
  overlay.classList.add(ACTIVE_CLASS);
  const tracking: HighlightTracking = { raf: 0, timer: 0 };
  const track = () => {
    // 覆盖层已脱离文档（宿主卸载 / 整片替换）：逐帧对齐再无意义，就地收束而不等满时长。
    if (!overlay.isConnected) {
      stopTracking(overlay);
      return;
    }
    alignOverlay(overlay, target);
    tracking.raf = window.requestAnimationFrame(track);
  };
  tracking.raf = window.requestAnimationFrame(track);
  tracking.timer = window.setTimeout(() => {
    window.cancelAnimationFrame(tracking.raf);
    overlay.classList.remove(ACTIVE_CLASS);
    highlightTracking.delete(overlay);
  }, duration);
  highlightTracking.set(overlay, tracking);
  return true;
}
