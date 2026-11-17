/**
 * 并排差异视图的滚动同步控制器。
 *
 * 背景（事项 2 根因）：旧实现用同步布尔锁抑制回环，写入对侧 `scrollTop` 后立刻复位，
 * 而浏览器 `scroll` 事件是异步派发的，对侧事件到达时锁已复位，于是把源侧按比例写回，
 * 形成 A→B→A 反馈环。两侧 scrollHeight 不等时，会把源侧持续拉回若干像素，
 * 到底部与滚轮输入对抗即表现为抽搐。
 *
 * 本控制器用三个机制取代布尔锁：
 * - 程序写入识别：写入后回读实际位置并记录为期望值；目标侧事件落在期望值附近即视为
 *   自己写的并吞掉，离开期望值的事件按用户输入处理（无时间死区，跨侧切换可立即生效）；
 * - 滚动所有权：未被识别为程序写入的事件说明该侧是滚动源，一帧内多次滚动合并为一次同步；
 * - 首尾对齐：源侧在底部（含 1px 平台）时直接写目标最大值；顶部由比例映射自然得到 0，
 *   其余按比例换算，减少边界处的取整往复。
 */

export interface ScrollBox {
  scrollTop: number;
  scrollLeft: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  addEventListener(type: 'scroll', listener: () => void): void;
  removeEventListener(type: 'scroll', listener: () => void): void;
}

export interface ScrollSyncEnv {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
}

export interface ScrollSyncController {
  attach: () => void;
  detach: () => void;
}

/** 视为同值的像素阈值（含小数滚动位置）；程序写入容差在此基础上叠加 1px。 */
export const SCROLL_EPSILON = 1;

type Side = 'a' | 'b';

/**
 * 按源侧位置计算目标侧应对齐到的 scrollTop。
 * 底部硬对齐（含 1px 平台）：源到底时目标也到底；顶部由比例映射自然得到 0。
 */
export function computeAlignedScrollTop(source: ScrollBox, target: ScrollBox): number {
  const sourceMax = Math.max(0, source.scrollHeight - source.clientHeight);
  const targetMax = Math.max(0, target.scrollHeight - target.clientHeight);
  if (sourceMax <= 0 || targetMax <= 0) {
    return 0;
  }
  if (source.scrollTop >= sourceMax - SCROLL_EPSILON) {
    return targetMax;
  }
  const ratio = Math.max(0, Math.min(source.scrollTop, sourceMax)) / sourceMax;
  return ratio * targetMax;
}

/** 按源侧位置计算目标侧应对齐到的 scrollLeft（无溢出时归零）。 */
export function computeAlignedScrollLeft(source: ScrollBox, target: ScrollBox): number {
  const sourceMax = Math.max(0, source.scrollWidth - source.clientWidth);
  if (sourceMax <= 0) {
    return 0;
  }
  const targetMax = Math.max(0, target.scrollWidth - target.clientWidth);
  if (targetMax <= 0) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(source.scrollLeft, sourceMax)) / sourceMax;
  return ratio * targetMax;
}

const defaultEnv: ScrollSyncEnv = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

interface PendingWrite {
  target: ScrollBox;
  top: number;
  left: number;
}

export function createScrollSync(
  a: ScrollBox,
  b: ScrollBox,
  env: Partial<ScrollSyncEnv> = {},
): ScrollSyncController {
  const resolvedEnv: ScrollSyncEnv = { ...defaultEnv, ...env };
  const boxes: Record<Side, ScrollBox> = { a, b };
  let owner: Side | null = null;
  let pendingWrite: PendingWrite | null = null;
  let frame = 0;
  let attached = false;

  const other = (side: Side): Side => (side === 'a' ? 'b' : 'a');

  /** 目标侧事件是否正是自己刚写入的：是则吞掉，避免回环。 */
  const consumeOwnWrite = (side: Side): boolean => {
    if (!pendingWrite || pendingWrite.target !== boxes[side]) {
      return false;
    }
    const write = pendingWrite;
    pendingWrite = null;
    const box = boxes[side];
    return (
      Math.abs(box.scrollTop - write.top) <= SCROLL_EPSILON + 1 &&
      Math.abs(box.scrollLeft - write.left) <= SCROLL_EPSILON + 1
    );
  };

  const syncOnce = (source: Side) => {
    if (owner !== source) {
      return;
    }
    const from = boxes[source];
    const to = boxes[other(source)];
    const top = computeAlignedScrollTop(from, to);
    const left = computeAlignedScrollLeft(from, to);
    if (
      Math.abs(to.scrollTop - top) <= SCROLL_EPSILON &&
      Math.abs(to.scrollLeft - left) <= SCROLL_EPSILON
    ) {
      return;
    }
    to.scrollTop = top;
    to.scrollLeft = left;
    // 记录回读的实际值：浏览器会把写入夹取到可滚动范围，用期望值归因会让
    // 夹取后的回显被误判为用户输入。
    pendingWrite = { target: to, top: to.scrollTop, left: to.scrollLeft };
  };

  const schedule = () => {
    if (frame !== 0) {
      return;
    }
    // 帧内回调读取当前 owner：同帧双侧滚动时以最后一次滚动的一侧为准，
    // 避免早退的 schedule 丢掉后到达的一侧。
    frame = resolvedEnv.requestFrame(() => {
      frame = 0;
      if (owner) {
        syncOnce(owner);
      }
    });
  };

  const onScroll = (side: Side) => () => {
    if (consumeOwnWrite(side)) {
      return;
    }
    // 位置已离开期望值：用户输入。立即夺取所有权（旧实现的 140ms 窗口会让
    // 短促切换到另一侧时事件被丢弃，两侧停在错位状态）。
    owner = side;
    schedule();
  };

  const handleA = onScroll('a');
  const handleB = onScroll('b');

  return {
    attach: () => {
      if (attached) {
        return;
      }
      attached = true;
      a.addEventListener('scroll', handleA);
      b.addEventListener('scroll', handleB);
    },
    detach: () => {
      if (!attached) {
        return;
      }
      attached = false;
      a.removeEventListener('scroll', handleA);
      b.removeEventListener('scroll', handleB);
      if (frame !== 0) {
        resolvedEnv.cancelFrame(frame);
        frame = 0;
      }
      pendingWrite = null;
      owner = null;
    },
  };
}
