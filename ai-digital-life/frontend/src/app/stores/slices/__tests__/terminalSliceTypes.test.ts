import { describe, it, expect } from 'vitest';
import {
  normalizeTerminalShellProfile,
  isTerminalProfile,
  TERMINAL_WORKSPACE_ID_KEY,
  TERMINAL_SHELL_SELECTOR_PROFILE_KEY,
} from '../terminalSliceTypes';

describe('isTerminalProfile', () => {
  it('accepts the three known profiles', () => {
    expect(isTerminalProfile('powershell')).toBe(true);
    expect(isTerminalProfile('bash')).toBe(true);
    expect(isTerminalProfile('cmd')).toBe(true);
  });

  it('rejects unknown or non-string values', () => {
    expect(isTerminalProfile('zsh')).toBe(false);
    expect(isTerminalProfile('')).toBe(false);
    expect(isTerminalProfile(null)).toBe(false);
    expect(isTerminalProfile(undefined)).toBe(false);
    expect(isTerminalProfile(42)).toBe(false);
  });
});

describe('normalizeTerminalShellProfile', () => {
  it('keeps a valid persisted profile', () => {
    expect(normalizeTerminalShellProfile('bash', 'powershell')).toBe('bash');
  });

  it('falls back to the default profile for invalid values', () => {
    expect(normalizeTerminalShellProfile('zsh', 'bash')).toBe('bash');
    expect(normalizeTerminalShellProfile(null, 'cmd')).toBe('cmd');
    expect(normalizeTerminalShellProfile(undefined, 'powershell')).toBe('powershell');
  });
});

describe('terminal persistence keys', () => {
  it('uses the adl-ui:terminal-* namespace without collisions', () => {
    expect(TERMINAL_WORKSPACE_ID_KEY).toBe('adl-ui:terminal-workspace-id');
    expect(TERMINAL_SHELL_SELECTOR_PROFILE_KEY).toBe('adl-ui:terminal-shell-selector-profile');
    expect(TERMINAL_WORKSPACE_ID_KEY).not.toBe(TERMINAL_SHELL_SELECTOR_PROFILE_KEY);
  });
});
