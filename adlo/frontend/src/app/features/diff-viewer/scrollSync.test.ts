import { describe, expect, it } from 'vitest';
import {
  computeAlignedScrollLeft,
  computeAlignedScrollTop,
  createScrollSync,
  type ScrollBox,
  type ScrollSyncEnv,
} from './scrollSync';

interface FakeBox extends ScrollBox {
  fire: () => void;
  /** 写入次数：位置断言在恒等映射下看不见回环，只有写次数能证明。 */
  writes: { top: number; left: number };
}

function makeBox(input: {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth?: number;
  clientWidth?: number;
  scrollTop?: number;
  scrollLeft?: number;
  /** 模拟浏览器夹取：写入超过该值时实际位置停在上限。 */
  maxTop?: number;
}): FakeBox {
  const listeners = new Set<() => void>();
  let top = input.scrollTop ?? 0;
  let left = input.scrollLeft ?? 0;
  const writes = { top: 0, left: 0 };
  const clampTop = (value: number) =>
    input.maxTop === undefined ? value : Math.min(value, input.maxTop);
  const box: FakeBox = {
    scrollHeight: input.scrollHeight,
    clientHeight: input.clientHeight,
    scrollWidth: input.scrollWidth ?? 0,
    clientWidth: input.clientWidth ?? 0,
    writes,
    get scrollTop() {
      return top;
    },
    set scrollTop(value: number) {
      writes.top += 1;
      top = clampTop(value);
    },
    get scrollLeft() {
      return left;
    },
    set scrollLeft(value: number) {
      writes.left += 1;
      left = value;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
    fire: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return box;
}

function makeEnv() {
  const frames = new Map<number, () => void>();
  let nextHandle = 1;
  const env: ScrollSyncEnv = {
    requestFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => {
      frames.delete(handle);
    },
  };
  return {
    env,
    runFrame: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    pendingFrames: () => frames.size,
  };
}

describe('computeAlignedScrollTop', () => {
  it('aligns the top edge exactly', () => {
    const source = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 0 });
    const target = makeBox({ scrollHeight: 400, clientHeight: 100 });
    expect(computeAlignedScrollTop(source, target)).toBe(0);
  });

  it('aligns the bottom edge to the target maximum instead of a ratio', () => {
    const source = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 900 });
    const target = makeBox({ scrollHeight: 400, clientHeight: 100 });
    expect(computeAlignedScrollTop(source, target)).toBe(300);
  });

  it('maps by ratio in the middle', () => {
    const source = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 450 });
    const target = makeBox({ scrollHeight: 400, clientHeight: 100 });
    expect(computeAlignedScrollTop(source, target)).toBeCloseTo(150, 5);
  });

  it('hard-aligns the 1px bottom plateau instead of using the ratio', () => {
    const source = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 899.5 });
    const target = makeBox({ scrollHeight: 400, clientHeight: 100 });
    // 比例映射会给 299.83；首尾硬对齐必须给目标最大值 300。
    expect(computeAlignedScrollTop(source, target)).toBe(300);
  });

  it('returns zero when the target cannot scroll', () => {
    const source = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 500 });
    const target = makeBox({ scrollHeight: 100, clientHeight: 100 });
    expect(computeAlignedScrollTop(source, target)).toBe(0);
  });
});

describe('computeAlignedScrollLeft', () => {
  it('maps horizontally without vertical assumptions', () => {
    const source = makeBox({
      scrollHeight: 1,
      clientHeight: 1,
      scrollWidth: 1000,
      clientWidth: 100,
      scrollLeft: 900,
    });
    const target = makeBox({
      scrollHeight: 1,
      clientHeight: 1,
      scrollWidth: 300,
      clientWidth: 100,
    });
    expect(computeAlignedScrollLeft(source, target)).toBe(200);
  });

  it('resets the target when the source has no horizontal overflow', () => {
    const source = makeBox({
      scrollHeight: 1,
      clientHeight: 1,
      scrollWidth: 100,
      clientWidth: 100,
    });
    const target = makeBox({
      scrollHeight: 1,
      clientHeight: 1,
      scrollWidth: 300,
      clientWidth: 100,
      scrollLeft: 50,
    });
    expect(computeAlignedScrollLeft(source, target)).toBe(0);
  });
});

describe('createScrollSync', () => {
  it('uses the clamped position when recognizing its own write', () => {
    const clock = makeEnv();
    const a = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 450 });
    // 目标侧几何声称能到 900，但浏览器把写入夹到 100（模拟内容高度在测量后变化）。
    const b = makeBox({ scrollHeight: 1000, clientHeight: 100, maxTop: 100 });
    const sync = createScrollSync(a, b, clock.env);
    sync.attach();

    a.fire();
    clock.runFrame();
    expect(b.scrollTop).toBe(100);

    // 回显值 100 ≠ 期望 450；按回读实际值归因才会吞掉，否则会把 A 拽走。
    b.fire();
    clock.runFrame();
    expect(a.scrollTop).toBe(450);
    expect(a.writes.top).toBe(0);
  });

  it('syncs the last scrolled side when both panes scroll in one frame', () => {
    const clock = makeEnv();
    const a = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 100 });
    const b = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 0 });
    const sync = createScrollSync(a, b, clock.env);
    sync.attach();

    a.fire();
    b.scrollTop = 200;
    b.fire();
    clock.runFrame();

    // 最后一侧（B）是 owner：A 必须跟到 B 的位置，而不是把 B 拉回 A。
    expect(a.scrollTop).toBe(200);
  });

  it('keeps the source position when the echo arrives before the source scroll event', () => {
    const clock = makeEnv();
    const a = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 300 });
    const b = makeBox({ scrollHeight: 1000, clientHeight: 100 });
    const sync = createScrollSync(a, b, clock.env);
    sync.attach();

    // 源侧滚动已生效但事件尚未派发时，控制器先收到一次请求；
    a.fire();
    clock.runFrame();
    expect(b.scrollTop).toBe(300);

    // 用户继续滚到 345（事件未派发），目标侧回显先到。
    a.scrollTop = 345;
    a.writes.top = 0;
    b.fire();
    clock.runFrame();

    // 旧布尔锁实现会在这里把源侧写回 300；新实现必须保持 345。
    expect(a.scrollTop).toBe(345);
    expect(a.writes.top).toBe(0);

    // 源侧事件随后到达：目标侧跟到 345（同高）。
    a.fire();
    clock.runFrame();
    expect(b.scrollTop).toBe(345);
  });

  it('lets the other pane take ownership immediately when it moves', () => {
    const clock = makeEnv();
    const a = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 900 });
    const b = makeBox({ scrollHeight: 400, clientHeight: 100 });
    const sync = createScrollSync(a, b, clock.env);
    sync.attach();

    a.fire();
    clock.runFrame();
    expect(b.scrollTop).toBe(300);

    // 用户切到 B 并滚到 100（不等于程序写入期望值 300）：立即取得所有权。
    b.scrollTop = 100;
    b.fire();
    clock.runFrame();
    expect(a.scrollTop).toBe(300);
  });

  it('syncs horizontal positions through the same controller', () => {
    const clock = makeEnv();
    const a = makeBox({
      scrollHeight: 500,
      clientHeight: 100,
      scrollWidth: 2000,
      clientWidth: 500,
      scrollLeft: 400,
    });
    const b = makeBox({
      scrollHeight: 500,
      clientHeight: 100,
      scrollWidth: 2000,
      clientWidth: 500,
    });
    const sync = createScrollSync(a, b, clock.env);
    sync.attach();

    a.fire();
    clock.runFrame();
    expect(b.scrollLeft).toBe(400);
    expect(b.writes.left).toBe(1);
  });

  it('coalesces multiple scroll events into one frame', () => {
    const clock = makeEnv();
    const a = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 100 });
    const b = makeBox({ scrollHeight: 1000, clientHeight: 100 });
    const sync = createScrollSync(a, b, clock.env);
    sync.attach();

    a.fire();
    a.scrollTop = 200;
    a.fire();
    expect(clock.pendingFrames()).toBe(1);
    clock.runFrame();
    expect(b.scrollTop).toBe(200);
    expect(b.writes.top).toBe(1);
  });

  it('detach removes listeners and cancels a pending frame', () => {
    const clock = makeEnv();
    const a = makeBox({ scrollHeight: 1000, clientHeight: 100, scrollTop: 100 });
    const b = makeBox({ scrollHeight: 1000, clientHeight: 100 });
    const sync = createScrollSync(a, b, clock.env);
    sync.attach();

    a.fire();
    sync.detach();
    expect(clock.pendingFrames()).toBe(0);
    a.scrollTop = 500;
    a.fire();
    expect(clock.pendingFrames()).toBe(0);
    expect(b.scrollTop).toBe(0);
  });
});
