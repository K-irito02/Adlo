import { describe, it, expect } from 'vitest';
import { resolveErrorToastLevel, type ErrorToastLevel } from '../errorToastLevel';

describe('resolveErrorToastLevel', () => {
  it('maps real error codes to error level', () => {
    const errorCodes = [
      'STORAGE_ERROR',
      'MIGRATION_ERROR',
      'SECURITY_ERROR',
      'PATCH_ERROR',
      'MODEL_ERROR',
      'INTERNAL_ERROR',
      'NETWORK_ERROR',
      'INVOKE_ERROR',
      'PREVIEW_API_ERROR',
      'IO_ERROR',
      'CONFIG_ERROR',
      'TERMINAL_ERROR',
    ];
    for (const code of errorCodes) {
      expect(resolveErrorToastLevel(code, 'boom')).toBe<ErrorToastLevel>('error');
    }
  });

  it('maps recoverable codes to warning level', () => {
    const warningCodes = ['NOT_FOUND', 'INVALID_INPUT', 'APPROVAL_REQUIRED'];
    for (const code of warningCodes) {
      expect(resolveErrorToastLevel(code, 'detail')).toBe<ErrorToastLevel>('warning');
    }
  });

  it('maps WORKSPACE_ERROR to warning by default', () => {
    expect(resolveErrorToastLevel('WORKSPACE_ERROR', 'cannot open folder')).toBe('warning');
  });

  it('maps the non-git-repository workspace detail to info', () => {
    expect(
      resolveErrorToastLevel(
        'WORKSPACE_ERROR',
        'fatal: not a git repository (or any of the parent directories): .git',
      ),
    ).toBe<ErrorToastLevel>('info');
  });

  it('defaults unknown codes to error', () => {
    expect(resolveErrorToastLevel('UNKNOWN_CODE', 'x')).toBe<ErrorToastLevel>('error');
    expect(resolveErrorToastLevel('', '')).toBe<ErrorToastLevel>('error');
  });
});
