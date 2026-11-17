import { describe, expect, it } from 'vitest';

/**
 * jsdom 26 缺少 PointerEvent 时，`fireEvent.pointer*` 会退化成普通 Event，
 * 坐标丢失后阈值与落点判断会靠 NaN 比较“假绿”。这里锁定 setup 提供的
 * 必要 shim，避免未来重排/删除 test-setup 时静默退化。
 */
describe('test environment shims', () => {
  it('provides PointerEvent with coordinates, pointerId and pointerType', () => {
    expect(window.PointerEvent).toBeDefined();
    const event = new PointerEvent('pointermove', {
      clientX: 12,
      clientY: 34,
      pointerId: 7,
      pointerType: 'pen',
    });
    expect(event).toBeInstanceOf(window.PointerEvent);
    expect(event.clientX).toBe(12);
    expect(event.clientY).toBe(34);
    expect(event.pointerId).toBe(7);
    expect(event.pointerType).toBe('pen');
  });

  it('provides ResizeObserver, IntersectionObserver and matchMedia', () => {
    expect(typeof window.ResizeObserver).toBe('function');
    expect(typeof window.IntersectionObserver).toBe('function');
    expect(typeof window.matchMedia).toBe('function');
    expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false);
  });
});
