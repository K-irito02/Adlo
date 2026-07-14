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
});
