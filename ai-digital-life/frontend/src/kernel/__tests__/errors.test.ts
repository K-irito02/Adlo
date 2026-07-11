import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  WorkspaceError,
  StateStoreError,
  ok,
  err,
  toUserMessage,
} from '../errors';
import { ERROR_CODES } from '../constants';

describe('IpcResult helpers', () => {
  it('ok creates a success result', () => {
    const result = ok({ foo: 1 });
    expect(result).toEqual({ ok: true, data: { foo: 1 } });
  });

  it('err creates a failure result with code and message', () => {
    const result = err('NOT_FOUND', 'item missing');
    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'item missing' } });
  });
});

describe('AppError shape', () => {
  it('AppError has code and message properties', () => {
    const err = new (class extends AppError {
      constructor() {
        super('TEST_CODE', 'test message');
      }
    })();
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.name).toBeDefined();
  });

  it('ValidationError has INVALID_INPUT code', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ERROR_CODES.invalidInput);
    expect(err.message).toBe('bad input');
  });

  it('WorkspaceError has INVALID_WORKSPACE code', () => {
    const err = new WorkspaceError('bad workspace');
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ERROR_CODES.invalidWorkspace);
    expect(err.message).toBe('bad workspace');
  });

  it('StateStoreError takes a custom code', () => {
    const err = new StateStoreError(ERROR_CODES.stateReadFailed, 'read failed');
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ERROR_CODES.stateReadFailed);
    expect(err.message).toBe('read failed');
  });
});

describe('toUserMessage', () => {
  it('extracts code and message from AppError', () => {
    const result = toUserMessage(new ValidationError('invalid'));
    expect(result).toEqual({ code: ERROR_CODES.invalidInput, message: 'invalid' });
  });

  it('extracts message from generic Error with INTERNAL_ERROR code', () => {
    const result = toUserMessage(new Error('oops'));
    expect(result).toEqual({ code: ERROR_CODES.internal, message: 'oops' });
  });

  it('returns unknown error for non-Error input', () => {
    const result = toUserMessage('string error');
    expect(result).toEqual({ code: ERROR_CODES.internal, message: 'Unknown error.' });
  });
});
