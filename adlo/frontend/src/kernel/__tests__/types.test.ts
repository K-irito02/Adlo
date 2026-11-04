import { describe, it, expect } from 'vitest';
import { APP_NAME, APP_VERSION, ERROR_CODES, EVENT_NAMES } from '../constants';

describe('kernel constants compile', () => {
  it('APP_NAME is defined', () => {
    expect(APP_NAME).toBe('Adlo');
  });

  it('APP_VERSION is defined', () => {
    expect(APP_VERSION).toBe('0.1.0');
  });

  it('ERROR_CODES has all expected codes', () => {
    expect(ERROR_CODES.invalidInput).toBe('INVALID_INPUT');
    expect(ERROR_CODES.invalidWorkspace).toBe('INVALID_WORKSPACE');
    expect(ERROR_CODES.notFound).toBe('NOT_FOUND');
    expect(ERROR_CODES.stateReadFailed).toBe('STATE_READ_FAILED');
    expect(ERROR_CODES.stateWriteFailed).toBe('STATE_WRITE_FAILED');
    expect(ERROR_CODES.workerUnavailable).toBe('WORKER_UNAVAILABLE');
    expect(ERROR_CODES.internal).toBe('INTERNAL_ERROR');
  });

  it('EVENT_NAMES has all expected events', () => {
    expect(EVENT_NAMES.appInitialized).toBe('app.initialized');
    expect(EVENT_NAMES.workspaceOpened).toBe('workspace.opened');
  });
});
