import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import StartupOverlay from '../StartupOverlay';

/**
 * jsdom 没有 `Element.getAnimations`，组件里的 `typeof root.getAnimations !== 'function'`
 * 会直接早退，所以接线层需要一个最小桩，才能验证"钩子到底有没有去暂停动画"。
 */
function stubAnimations() {
  const state = { pauses: 0 };
  const animations = [
    {
      // 初值故意用 null：钩子未触碰时应保持 null，`toBeNull()` 才能证明"真的没动"
      currentTime: null as number | null,
      pause: () => {
        state.pauses += 1;
      },
    },
  ];
  const original = Element.prototype.getAnimations;
  Element.prototype.getAnimations = (() => animations) as unknown as typeof original;
  return {
    state,
    animations,
    restore: () => {
      // jsdom 本身没有这个方法：还原成"不存在"比留一个 undefined 自有属性更贴近原状。
      if (original === undefined) {
        delete (Element.prototype as Partial<Element>).getAnimations;
      } else {
        Element.prototype.getAnimations = original;
      }
    },
  };
}

describe('StartupOverlay', () => {
  it('removes the static preload overlay once the React overlay mounts', () => {
    const preload = document.createElement('div');
    preload.id = 'preload-overlay';
    document.body.appendChild(preload);

    render(<StartupOverlay />);

    expect(document.getElementById('preload-overlay')).toBeNull();
  });

  it('renders the brand splash, its grid backdrop and the wordmark', () => {
    const { container } = render(<StartupOverlay />);

    const root = container.querySelector('.adl-splash');
    expect(root).toBeTruthy();
    // 整层装饰无信息量：aria-hidden 挂在根节点，子层不再重复声明。
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.adl-splash__name')?.textContent).toBe('Adlo · 安洛');
    expect(container.querySelector('.adl-splash__mark img')?.getAttribute('src')).toBe(
      '/adlo-icon.png',
    );
  });

  it('renders no canvas: the particle flow-field background is gone', () => {
    const { container } = render(<StartupOverlay />);

    expect(container.querySelector('canvas')).toBeNull();
  });

  // 回归保护：dev 定格钩子在没有 `adl-splash-at` 参数时绝不能暂停动画。
  // 事故形态是 `Number(params.get(...))` 把"参数缺失"当成 0ms，7 条动画被冻在首帧，
  // 窗口只剩底色；这条用例直接钉住接线，而不只是纯函数。
  it('does not freeze the timeline when no freeze param is present', async () => {
    const stub = stubAnimations();
    try {
      render(<StartupOverlay />);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      expect(stub.state.pauses).toBe(0);
      expect(stub.animations[0].currentTime).toBeNull();
    } finally {
      stub.restore();
    }
  });

  it('freezes the timeline at the requested millisecond', async () => {
    const stub = stubAnimations();
    window.history.replaceState({}, '', '/?adl-splash-at=1200');
    try {
      render(<StartupOverlay />);
      // 组件会在下一帧再 freeze 一次；先 flush 掉，否则桩被撤掉后回调会抛错。
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      expect(stub.animations[0].currentTime).toBe(1200);
      expect(stub.state.pauses).toBeGreaterThan(0);
    } finally {
      stub.restore();
      window.history.replaceState({}, '', '/');
    }
  });
});
