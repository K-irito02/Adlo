/** Stable empty object for Zustand selector fallback — prevents useSyncExternalStore infinite loops. */
export const EMPTY_KEYBINDS: Record<string, string> = {};

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export function isModifier(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

/** 平台判定单点（modifier 映射与显示分支共用，防漂移）。 */
export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    ',': 'comma',
    '+': 'plus',
    ' ': 'space',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Enter: 'enter',
    Escape: 'escape',
    Backspace: 'backspace',
    Delete: 'delete',
    Tab: 'tab',
  };
  return map[key] ?? key.toLowerCase();
}

export interface ModifierFlags {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** 按下事件中的修饰键原始部分串（与 recordKeybind 同一平台映射），供预览与录制共用。 */
export function modifierParts(event: ModifierFlags): string[] {
  const isMac = isMacPlatform();
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) {
    parts.push('mod');
  }
  if (isMac ? event.ctrlKey : event.metaKey) {
    parts.push(isMac ? 'ctrl' : 'meta');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }
  return parts;
}

export function recordKeybind(event: KeyboardEvent): string | null {
  const key = event.key;
  if (isModifier(key)) {
    return null;
  }

  const parts = modifierParts(event);
  parts.push(normalizeKey(key));
  return parts.join('+');
}

export function parseKeybind(keybind: string): string[] {
  if (!keybind || keybind === 'none') {
    return [];
  }
  return keybind.split('+').map((p) => p.trim().toLowerCase());
}

export function signatures(keybind: string | undefined): string[] {
  if (!keybind) {
    return [];
  }
  const parts = parseKeybind(keybind);
  if (parts.length === 0) {
    return [];
  }
  return [parts.slice().sort().join('+')];
}

export function formatKeybind(keybind: string | undefined): string {
  if (!keybind || keybind === 'none') {
    return '';
  }
  const isMac = isMacPlatform();
  return keybind
    .split('+')
    .map((p) => {
      if (p === 'mod') {
        return isMac ? '⌘' : 'Ctrl';
      }
      if (p === 'ctrl') {
        return isMac ? '⌃' : 'Ctrl';
      }
      if (p === 'meta') {
        return isMac ? '⌘' : 'Win';
      }
      if (p === 'alt') {
        return isMac ? '⌥' : 'Alt';
      }
      if (p === 'shift') {
        return isMac ? '⇧' : 'Shift';
      }
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(isMac ? '' : '+');
}
