import { createId, sanitizeSensitiveData, sleep } from "@ai-digital-life/kernel";
import type { Logger } from "@ai-digital-life/logger";

export type ErrorCategory = "system" | "network" | "ai" | "user";
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export interface ErrorInfo {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  retryable: boolean;
  timestamp: number;
}

class ClassifiedError extends Error {
  readonly info: ErrorInfo;

  constructor(info: ErrorInfo, options?: ErrorOptions) {
    super(info.message, options);
    this.name = new.target.name;
    this.info = info;
  }
}

export class SystemError extends ClassifiedError {
  constructor(code: string, message: string, options?: { severity?: ErrorSeverity; details?: Record<string, unknown>; recoverable?: boolean; retryable?: boolean }) {
    super({
      code,
      category: "system",
      severity: options?.severity ?? "high",
      message,
      details: options?.details,
      recoverable: options?.recoverable ?? false,
      retryable: options?.retryable ?? false,
      timestamp: Date.now()
    });
  }
}

export class NetworkError extends ClassifiedError {
  constructor(code: string, message: string, options?: { severity?: ErrorSeverity; details?: Record<string, unknown>; recoverable?: boolean; retryable?: boolean }) {
    super({
      code,
      category: "network",
      severity: options?.severity ?? "medium",
      message,
      details: options?.details,
      recoverable: options?.recoverable ?? true,
      retryable: options?.retryable ?? true,
      timestamp: Date.now()
    });
  }
}

export class AIError extends ClassifiedError {
  constructor(code: string, message: string, options?: { severity?: ErrorSeverity; details?: Record<string, unknown>; recoverable?: boolean; retryable?: boolean }) {
    super({
      code,
      category: "ai",
      severity: options?.severity ?? "medium",
      message,
      details: options?.details,
      recoverable: options?.recoverable ?? true,
      retryable: options?.retryable ?? true,
      timestamp: Date.now()
    });
  }
}

export class UserError extends ClassifiedError {
  constructor(code: string, message: string, options?: { severity?: ErrorSeverity; details?: Record<string, unknown> }) {
    super({
      code,
      category: "user",
      severity: options?.severity ?? "low",
      message,
      details: options?.details,
      recoverable: true,
      retryable: false,
      timestamp: Date.now()
    });
  }
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export class RetryStrategy {
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: RetryOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.initialDelayMs = options.initialDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 5000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof ClassifiedError) || error.info.retryable;
        if (!retryable || attempt === this.maxRetries) {
          break;
        }

        const delay = Math.min(this.initialDelayMs * 2 ** attempt, this.maxDelayMs);
        await sleep(delay);
      }
      attempt += 1;
    }

    throw lastError;
  }
}

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureAt = 0;

  constructor(
    private readonly options: {
      failureThreshold?: number;
      successThreshold?: number;
      timeoutMs?: number;
    } = {}
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const failureThreshold = this.options.failureThreshold ?? 5;
    const successThreshold = this.options.successThreshold ?? 2;
    const timeoutMs = this.options.timeoutMs ?? 30_000;

    if (this.state === "open") {
      if (Date.now() - this.lastFailureAt >= timeoutMs) {
        this.state = "half-open";
      } else {
        throw new SystemError("CIRCUIT_OPEN", "Circuit breaker is open.");
      }
    }

    try {
      const result = await fn();
      if (this.state === "half-open") {
        this.successes += 1;
        if (this.successes >= successThreshold) {
          this.state = "closed";
          this.successes = 0;
          this.failures = 0;
        }
      } else {
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures += 1;
      this.lastFailureAt = Date.now();
      if (this.state === "half-open" || this.failures >= failureThreshold) {
        this.state = "open";
        this.successes = 0;
      }
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

export class FallbackStrategy<T> {
  constructor(private readonly fallbackValue: T) {}

  async execute(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      return this.fallbackValue;
    }
  }
}

export interface ErrorReport {
  id: string;
  timestamp: number;
  error: {
    name: string;
    message: string;
    info?: ErrorInfo;
  };
  context: Record<string, unknown>;
  system: {
    platform: string;
    nodeVersion: string;
  };
}

export class ErrorReporter {
  async generateReport(error: Error, context: Record<string, unknown> = {}): Promise<ErrorReport> {
    return {
      id: createId("err"),
      timestamp: Date.now(),
      error: {
        name: error.name,
        message: error.message,
        info: error instanceof ClassifiedError ? error.info : undefined
      },
      context: sanitizeSensitiveData(context),
      system: {
        platform: process.platform,
        nodeVersion: process.version
      }
    };
  }
}

export class ErrorBoundary {
  constructor(
    private readonly name: string,
    private readonly logger?: Logger,
    private readonly fallback?: (error: Error) => Promise<void> | void
  ) {}

  async wrap<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error(String(error));
      this.logger?.error(`[${this.name}] ${resolved.message}`);
      await this.fallback?.(resolved);
      return undefined;
    }
  }
}
