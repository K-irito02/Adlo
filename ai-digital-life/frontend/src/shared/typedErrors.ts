export abstract class AppError extends Error {
  abstract readonly code: string
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND"
  constructor(detail: string) { super(`Not found: ${detail}`) }
}

export class InvalidInputError extends AppError {
  readonly code = "INVALID_INPUT"
  constructor(detail: string) { super(`Invalid input: ${detail}`) }
}

export class StorageError extends AppError {
  readonly code = "STORAGE_ERROR"
  constructor(detail: string) { super(`Storage error: ${detail}`) }
}

export class WorkspaceError extends AppError {
  readonly code = "WORKSPACE_ERROR"
  constructor(detail: string) { super(`Workspace error: ${detail}`) }
}

export class ConfigError extends AppError {
  readonly code = "CONFIG_ERROR"
  constructor(detail: string) { super(`Config error: ${detail}`) }
}

export class IOError extends AppError {
  readonly code = "IO_ERROR"
  constructor(detail: string) { super(`IO error: ${detail}`) }
}

export class MigrationError extends AppError {
  readonly code = "MIGRATION_ERROR"
  constructor(detail: string) { super(`Migration error: ${detail}`) }
}

export class SecurityError extends AppError {
  readonly code = "SECURITY_ERROR"
  constructor(detail: string) { super(`Security error: ${detail}`) }
}

export class ApprovalRequiredError extends AppError {
  readonly code = "APPROVAL_REQUIRED"
  constructor(detail: string) { super(`Approval required: ${detail}`) }
}

export class PatchError extends AppError {
  readonly code = "PATCH_ERROR"
  constructor(detail: string) { super(`Patch error: ${detail}`) }
}

export class TerminalError extends AppError {
  readonly code = "TERMINAL_ERROR"
  constructor(detail: string) { super(`Terminal error: ${detail}`) }
}

export class ModelError extends AppError {
  readonly code = "MODEL_ERROR"
  constructor(detail: string) { super(`Model error: ${detail}`) }
}

export class InternalError extends AppError {
  readonly code = "INTERNAL_ERROR"
  constructor(detail: string) { super(`Internal error: ${detail}`) }
}

export class NetworkError extends AppError {
  readonly code = "NETWORK_ERROR"
  constructor(detail: string, options?: { cause?: unknown }) {
    super(`Network error: ${detail}`, options)
  }
}

export class InvokeError extends AppError {
  readonly code = "INVOKE_ERROR"
  constructor(detail: string) { super(`Invoke error: ${detail}`) }
}

export class PreviewApiError extends AppError {
  readonly code = "PREVIEW_API_ERROR"
  constructor(detail: string) { super(`Preview API error: ${detail}`) }
}

const errorCodeMap: Record<string, new (detail: string) => AppError> = {
  NOT_FOUND: NotFoundError,
  INVALID_INPUT: InvalidInputError,
  STORAGE_ERROR: StorageError,
  WORKSPACE_ERROR: WorkspaceError,
  CONFIG_ERROR: ConfigError,
  IO_ERROR: IOError,
  MIGRATION_ERROR: MigrationError,
  SECURITY_ERROR: SecurityError,
  APPROVAL_REQUIRED: ApprovalRequiredError,
  PATCH_ERROR: PatchError,
  TERMINAL_ERROR: TerminalError,
  MODEL_ERROR: ModelError,
  INTERNAL_ERROR: InternalError,
  NETWORK_ERROR: NetworkError,
  INVOKE_ERROR: InvokeError,
  PREVIEW_API_ERROR: PreviewApiError,
}

export function fromIpcErrorCode(code: string, message: string): AppError {
  const Ctor = errorCodeMap[code]
  if (Ctor) { return new Ctor(message) }
  return new InternalError(message)
}
