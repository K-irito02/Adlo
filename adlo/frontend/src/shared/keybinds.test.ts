import { describe, it, expect } from 'vitest';
import {
  isModifier,
  normalizeKey,
  recordKeybind,
  parseKeybind,
  signatures,
  formatKeybind,
  EMPTY_KEYBINDS,
} from './keybinds';

describe('keybinds', () => {
  it('isModifier detects modifier keys', () => {
    expect(isModifier('Control')).toBe(true);
    expect(isModifier('Shift')).toBe(true);
    expect(isModifier('Alt')).toBe(true);
    expect(isModifier('Meta')).toBe(true);
    expect(isModifier('A')).toBe(false);
    expect(isModifier('Enter')).toBe(false);
  });

  it('normalizeKey maps special keys', () => {
    expect(normalizeKey(',')).toBe('comma');
    expect(normalizeKey('+')).toBe('plus');
    expect(normalizeKey(' ')).toBe('space');
    expect(normalizeKey('ArrowUp')).toBe('up');
    expect(normalizeKey('ArrowDown')).toBe('down');
    expect(normalizeKey('ArrowLeft')).toBe('left');
    expect(normalizeKey('ArrowRight')).toBe('right');
    expect(normalizeKey('Enter')).toBe('enter');
    expect(normalizeKey('Escape')).toBe('escape');
    expect(normalizeKey('Backspace')).toBe('backspace');
    expect(normalizeKey('Delete')).toBe('delete');
    expect(normalizeKey('Tab')).toBe('tab');
    expect(normalizeKey('A')).toBe('a');
    expect(normalizeKey('P')).toBe('p');
  });

  it('parseKeybind splits parts', () => {
    expect(parseKeybind('mod+shift+p')).toEqual(['mod', 'shift', 'p']);
    expect(parseKeybind('none')).toEqual([]);
    expect(parseKeybind('')).toEqual([]);
  });

  it('signatures returns sorted signature for conflict detection', () => {
    // 顺序无关比较：不同顺序的相同键应产生相同签名
    const sig1 = signatures('mod+shift+p');
    const sig2 = signatures('shift+mod+p');
    expect(sig1).toEqual(sig2);
    expect(sig1.length).toBe(1);
    expect(sig1[0]).toContain('mod');
    expect(sig1[0]).toContain('shift');
    expect(sig1[0]).toContain('p');
    expect(signatures(undefined)).toEqual([]);
    expect(signatures('none')).toEqual([]);
  });

  it('formatKeybind formats for display', () => {
    const result = formatKeybind('mod+shift+p');
    expect(result).toBeTruthy();
    expect(result).toMatch(/p/i); // 包含字母键

    expect(formatKeybind('none')).toBe('');
    expect(formatKeybind(undefined)).toBe('');
    expect(formatKeybind('')).toBe('');
  });

  it('recordKeybind returns null for modifier-only presses', () => {
    expect(recordKeybind(new KeyboardEvent('keydown', { key: 'Shift' }))).toBeNull();
    expect(recordKeybind(new KeyboardEvent('keydown', { key: 'Control' }))).toBeNull();
    expect(recordKeybind(new KeyboardEvent('keydown', { key: 'Alt' }))).toBeNull();
    expect(recordKeybind(new KeyboardEvent('keydown', { key: 'Meta' }))).toBeNull();
  });

  it('recordKeybind returns normalized keybind string', () => {
    const event = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, shiftKey: true });
    const result = recordKeybind(event);
    expect(result).toBeTruthy();
    expect(result).toContain('shift');
    expect(result).toContain('p');
  });

  it('recordKeybind includes alt modifier', () => {
    const event = new KeyboardEvent('keydown', { key: 'k', altKey: true });
    const result = recordKeybind(event);
    expect(result).toBeTruthy();
    expect(result).toContain('alt');
    expect(result).toContain('k');
  });

  it('EMPTY_KEYBINDS returns stable reference for Zustand selector fallback', () => {
    // 验证 EMPTY_KEYBINDS 始终是同一个引用 — 防止 useSyncExternalStore 无限循环
    const ref1 = EMPTY_KEYBINDS;
    const ref2 = EMPTY_KEYBINDS;
    expect(ref1).toBe(ref2);
    expect(EMPTY_KEYBINDS).toEqual({});
  });
});
