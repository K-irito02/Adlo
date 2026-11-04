import { describe, it, expect } from 'vitest';
import { computePopoverPosition } from '../searchEnginePopoverPosition';

describe('computePopoverPosition', () => {
  const base = {
    anchorLeft: 300,
    anchorRight: 324,
    anchorBottom: 200,
    popoverWidth: 260,
    viewportWidth: 800,
  };

  it('uses left alignment when popover fits on the right', () => {
    const result = computePopoverPosition(base);
    expect(result.left).toBe(300);
    expect(result.right).toBeUndefined();
    expect(result.top).toBe(204);
  });

  it('switches to right alignment when popover would overflow the right edge', () => {
    const result = computePopoverPosition({
      ...base,
      anchorLeft: 560,
      anchorRight: 584,
      viewportWidth: 800,
      popoverWidth: 260,
    });
    // 560 + 260 = 820 > 800 - 8, so right-aligned
    expect(result.right).toBe(800 - 584);
    expect(result.left).toBeUndefined();
    expect(result.top).toBe(204);
  });

  it('uses right alignment when anchor is at the very right edge', () => {
    const result = computePopoverPosition({
      anchorLeft: 780,
      anchorRight: 804,
      anchorBottom: 150,
      popoverWidth: 260,
      viewportWidth: 800,
    });
    // anchorRight 超视口右缘 → right 被钳制为非负（800-804=-4 → 0），避免 popover 移出视口
    expect(result.right).toBe(0);
    expect(result.left).toBeUndefined();
  });

  it('respects custom margin', () => {
    const result = computePopoverPosition({
      ...base,
      anchorLeft: 540,
      anchorRight: 564,
      popoverWidth: 260,
      viewportWidth: 800,
      margin: 20,
    });
    // 540 + 260 = 800 > 800 - 20 = 780 → right-aligned
    expect(result.right).toBe(800 - 564);
    expect(result.left).toBeUndefined();
  });

  it('rounds top to integer', () => {
    const result = computePopoverPosition({
      ...base,
      anchorBottom: 200.5,
    });
    expect(result.top).toBe(205);
  });

  it('falls back to left margin when right-aligned would overflow the left edge', () => {
    // 锚点贴右边缘且 popover 很宽：右对齐后左边缘 anchorRight - popoverWidth 会 < margin，
    // 回退为左边缘对齐视口左侧并留 margin，同时以 maxWidth 钳制右缘不溢出。
    const result = computePopoverPosition({
      anchorLeft: 700,
      anchorRight: 724,
      anchorBottom: 150,
      popoverWidth: 800,
      viewportWidth: 800,
    });
    expect(result.left).toBe(8);
    expect(result.right).toBeUndefined();
    expect(result.maxWidth).toBe(800 - 8);
  });

  it('clamps left alignment when anchor is negative (outside left viewport edge)', () => {
    const result = computePopoverPosition({
      ...base,
      anchorLeft: -20,
      anchorRight: 4,
      popoverWidth: 260,
    });
    // anchorLeft < margin → clamp 到 margin=8，避免贴/越过视口左缘
    expect(result.left).toBe(8);
  });

  it('clamps right to 0 when anchor right is beyond the viewport right edge', () => {
    const result = computePopoverPosition({
      anchorLeft: 780,
      anchorRight: 820,
      anchorBottom: 150,
      popoverWidth: 260,
      viewportWidth: 800,
    });
    // anchorRight > viewportWidth → right 恒为非负；anchorLeft+width 溢出不 fit → 右对齐
    expect(result.right).toBe(0);
    expect(result.left).toBeUndefined();
  });
});
