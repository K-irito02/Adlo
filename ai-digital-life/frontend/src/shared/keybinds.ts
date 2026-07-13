/** Stable empty object for Zustand selector fallback — prevents useSyncExternalStore infinite loops. */
export const EMPTY_KEYBINDS: Record<string, string> = {};

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export function isModifier(key: string): boolean {
  return MODIFIER_KEYS.has(key);
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

export function recordKeybind(event: KeyboardEvent): string | null {
  const key = event.key;
  if (isModifier(key)) {
    return null;
  }

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
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
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
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
