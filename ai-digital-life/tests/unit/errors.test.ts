import { describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  ErrorBoundary,
  ErrorReporter,
  NetworkError,
  RetryStrategy,
  SystemError
} from "@ai-digital-life/errors";

function createFakeLogger() {
  return {
    info() {},
    warn() {},
    error: vi.fn()
  };
}

describe("errors", () => {
  it("retries retryable failures until success", async () => {
    const retry = new RetryStrategy({ maxRetries: 2, initialDelayMs: 1, maxDelayMs: 2 });
    let attempts = 0;

    const result = await retry.execute(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new NetworkError("NET_TIMEOUT", "Temporary timeout.");
      }
      return "ok";
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("opens the circuit after repeated failures", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, timeoutMs: 1000 });

    await expect(
      breaker.execute(async () => {
        throw new SystemError("FS_FAIL", "Disk unavailable.");
      })
    ).rejects.toThrow("Disk unavailable.");
    await expect(
      breaker.execute(async () => {
        throw new SystemError("FS_FAIL", "Disk unavailable.");
      })
    ).rejects.toThrow("Disk unavailable.");
    await expect(
      breaker.execute(async () => {
        throw new SystemError("FS_FAIL", "Disk unavailable.");
      })
    ).rejects.toThrow("Circuit breaker is open.");
  });

  it("generates sanitized error reports", async () => {
    const reporter = new ErrorReporter();
    const report = await reporter.generateReport(new SystemError("CFG", "Invalid config."), {
      apiKey: "secret-value",
      nested: {
        token: "another-secret"
      }
    });

    expect(report.error.message).toBe("Invalid config.");
    expect(report.context).toMatchObject({
      apiKey: "[REDACTED]",
      nested: {
        token: "[REDACTED]"
      }
    });
  });

  it("captures errors through the boundary fallback", async () => {
    const logger = createFakeLogger();
    const fallback = vi.fn();
    const boundary = new ErrorBoundary("unit-test", logger as never, fallback);

    const result = await boundary.wrap(async () => {
      throw new Error("boom");
    });

    expect(result).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(fallback).toHaveBeenCalled();
  });
});
