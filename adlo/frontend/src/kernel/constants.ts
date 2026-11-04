export const APP_NAME = 'Adlo';
export const APP_VERSION = '0.1.0';
export const APP_STATE_SCHEMA_VERSION = '1';
export const APPROVAL_POLICY_MODE = 'manual';
export const GLOBAL_WORKSPACE_ID = '__global__';

export const EVENT_NAMES = {
  appInitialized: 'app.initialized',
  appShutdown: 'app.shutdown',
  configChanged: 'config.changed',
  workspaceOpened: 'workspace.opened',
  workspaceClosed: 'workspace.closed',
  sessionRestored: 'session.restored',
  retrievalStatusChanged: 'retrieval.status-changed',
  taskUpserted: 'task.upserted',
  approvalRequested: 'approval.requested',
  approvalDecided: 'approval.decided',
} as const;

export const ERROR_CODES = {
  invalidInput: 'INVALID_INPUT',
  invalidWorkspace: 'INVALID_WORKSPACE',
  notFound: 'NOT_FOUND',
  stateReadFailed: 'STATE_READ_FAILED',
  stateWriteFailed: 'STATE_WRITE_FAILED',
  workerUnavailable: 'WORKER_UNAVAILABLE',
  internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
