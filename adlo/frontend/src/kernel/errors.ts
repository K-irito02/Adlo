import { type ErrorCode, ERROR_CODES } from './constants';

export interface IpcError {
  code: ErrorCode | string;
  message: string;
}

export type IpcResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: IpcError;
    };

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function err<T>(code: ErrorCode | string, message: string): IpcResult<T> {
  return { ok: false, error: { code, message } };
}

export abstract class AppError extends Error {
  readonly code: ErrorCode | string;

  protected constructor(code: ErrorCode | string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(ERROR_CODES.invalidInput, message, options);
  }
}

export class WorkspaceError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(ERROR_CODES.invalidWorkspace, message, options);
  }
}

export class StateStoreError extends AppError {
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}

export function toUserMessage(error: unknown): IpcError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: ERROR_CODES.internal,
      message: error.message,
    };
  }

  return {
    code: ERROR_CODES.internal,
    message: 'Unknown error.',
  };
}
