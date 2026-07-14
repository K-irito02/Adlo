import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useClickOutside } from '../useClickOutside';
import { useRef, type RefObject } from 'react';

function setup(enabled = true) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const outside = document.createElement('div');
  document.body.appendChild(outside);

  const { result } = renderHook(() => {
    const ref = useRef<HTMLDivElement>(null);
    return ref;
  });

  const onOutsideClick = vi.fn();
  const onEscape = vi.fn();

  const { rerender, unmount } = renderHook(
    (props: {
      ref: RefObject<Element | null>;
      enabled: boolean;
      onOutsideClick: () => void;
      onEscape: () => void;
    }) =>
      useClickOutside(props.ref, props.enabled, {
        onOutsideClick: props.onOutsideClick,
        onEscape: props.onEscape,
      }),
    {
      initialProps: {
        ref: result.current,
        enabled,
        onOutsideClick,
        onEscape,
      },
    }
  );

  return { ref: result.current, target, outside, onOutsideClick, onEscape, rerender, unmount };
}

function dispatchMouseDown(target: Node) {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

function dispatchKeyDown(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useClickOutside', () => {
  it('calls onOutsideClick when mousedown outside ref', () => {
    const { ref, target, outside, onOutsideClick } = setup();
    target.appendChild(document.createElement('span'));
    ref.current = target;

    dispatchMouseDown(outside);

    expect(onOutsideClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onOutsideClick when clicking inside ref', () => {
    const { ref, target, onOutsideClick } = setup();
    const inner = document.createElement('span');
    target.appendChild(inner);
    ref.current = target;

    dispatchMouseDown(target);

    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it('calls onEscape when Escape key pressed', () => {
    const { ref, target, onEscape } = setup();
    ref.current = target;

    dispatchKeyDown('Escape');

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not call callbacks when enabled is false', () => {
    const { ref, target, outside, onOutsideClick, onEscape } = setup(false);
    ref.current = target;

    dispatchMouseDown(outside);
    dispatchKeyDown('Escape');

    expect(onOutsideClick).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });

  describe('with multiple refs', () => {
    function multiSetup(enabled = true) {
      const target1 = document.createElement('div');
      const target2 = document.createElement('div');
      document.body.appendChild(target1);
      document.body.appendChild(target2);
      const outside = document.createElement('div');
      document.body.appendChild(outside);

      const ref1 = { current: target1 } as React.RefObject<Element | null>;
      const ref2 = { current: target2 } as React.RefObject<Element | null>;
      const onOutsideClick = vi.fn();
      const onEscape = vi.fn();

      const { rerender, unmount } = renderHook(
        (props: {
          refs: readonly React.RefObject<Element | null>[];
          enabled: boolean;
          onOutsideClick: () => void;
          onEscape: () => void;
        }) =>
          useClickOutside(props.refs, props.enabled, {
            onOutsideClick: props.onOutsideClick,
            onEscape: props.onEscape,
          }),
        {
          initialProps: {
            refs: [ref1, ref2],
            enabled,
            onOutsideClick,
            onEscape,
          },
        }
      );

      return { target1, target2, outside, onOutsideClick, onEscape, rerender, unmount };
    }

    it('calls onOutsideClick when clicking outside all refs', () => {
      const { outside, onOutsideClick } = multiSetup();
      dispatchMouseDown(outside);
      expect(onOutsideClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onOutsideClick when clicking inside first ref', () => {
      const { target1, onOutsideClick } = multiSetup();
      dispatchMouseDown(target1);
      expect(onOutsideClick).not.toHaveBeenCalled();
    });

    it('does not call onOutsideClick when clicking inside second ref', () => {
      const { target2, onOutsideClick } = multiSetup();
      dispatchMouseDown(target2);
      expect(onOutsideClick).not.toHaveBeenCalled();
    });
  });
});
