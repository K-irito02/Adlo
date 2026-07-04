import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  InvalidInputError,
  StorageError,
  WorkspaceError,
  NetworkError,
  InternalError,
  fromIpcErrorCode,
} from '../typedErrors'

describe("Typed error classes", () => {
  it("NotFoundError constructor and instanceof", () => {
    const err = new NotFoundError("workspace not found")
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err.message).toBe("Not found: workspace not found")
    expect(err.code).toBe("NOT_FOUND")
  })

  it("InvalidInputError constructor and instanceof", () => {
    const err = new InvalidInputError("name is required")
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(InvalidInputError)
    expect(err.message).toBe("Invalid input: name is required")
    expect(err.code).toBe("INVALID_INPUT")
  })

  it("NetworkError wraps cause", () => {
    const cause = new TypeError("fetch failed")
    const err = new NetworkError("timeout", { cause })
    expect(err.message).toBe("Network error: timeout")
    expect(err.cause).toBe(cause)
  })

  it("fromIpcErrorCode maps NOT_FOUND to NotFoundError", () => {
    const err = fromIpcErrorCode("NOT_FOUND", "workspace")
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err.message).toBe("Not found: workspace")
  })

  it("fromIpcErrorCode maps unknown code to InternalError", () => {
    const err = fromIpcErrorCode("UNKNOWN_CODE", "something broke")
    expect(err).toBeInstanceOf(InternalError)
    expect(err.message).toBe("Internal error: something broke")
  })

  it("fromIpcErrorCode maps all 16 known codes", () => {
    const codes = [
      "NOT_FOUND", "INVALID_INPUT", "STORAGE_ERROR", "WORKSPACE_ERROR",
      "CONFIG_ERROR", "IO_ERROR", "MIGRATION_ERROR", "SECURITY_ERROR",
      "APPROVAL_REQUIRED", "PATCH_ERROR", "TERMINAL_ERROR", "MODEL_ERROR",
      "INTERNAL_ERROR", "NETWORK_ERROR", "INVOKE_ERROR", "PREVIEW_API_ERROR",
    ]
    for (const code of codes) {
      const err = fromIpcErrorCode(code, "test")
      expect(err).toBeInstanceOf(AppError)
    }
  })
})
