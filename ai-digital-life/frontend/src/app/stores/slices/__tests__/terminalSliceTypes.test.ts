import { describe, it, expect } from 'vitest';
import { isTerminalProfile } from '../terminalSliceTypes';

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
