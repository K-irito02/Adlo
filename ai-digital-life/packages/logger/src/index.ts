import fs from "node:fs/promises";
import path from "node:path";
import { type LogEntrySummary, type LogLevel } from "@ai-digital-life/kernel";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export class Logger {
  private readonly scope: string;
  private readonly level: LogLevel;
  private readonly logFilePath: string;
  private readonly recentEntries: LogEntrySummary[];
  private readonly sharedEntries: LogEntrySummary[];

  constructor(scope: string, level: LogLevel, logFilePath: string, sharedEntries: LogEntrySummary[]) {
    this.scope = scope;
    this.level = level;
    this.logFilePath = logFilePath;
    this.recentEntries = sharedEntries;
    this.sharedEntries = sharedEntries;
  }

  child(scopeSuffix: string): Logger {
    return new Logger(`${this.scope}:${scopeSuffix}`, this.level, this.logFilePath, this.sharedEntries);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  error(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void {
    const error = errorOrContext instanceof Error ? errorOrContext : undefined;
    const mergedContext =
      errorOrContext && !(errorOrContext instanceof Error)
        ? { ...errorOrContext, ...context }
        : context;
    this.write("error", message, mergedContext, error);
  }

  async measure<T>(message: string, fn: () => Promise<T> | T, context?: Record<string, unknown>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      this.write("info", message, context, undefined, Date.now() - startedAt);
      return result;
    } catch (error) {
      this.write(
        "error",
        `${message} failed`,
        context,
        error instanceof Error ? error : new Error(String(error)),
        Date.now() - startedAt
      );
      throw error;
    }
  }

  getRecentEntries(limit = 20): LogEntrySummary[] {
    return this.recentEntries.slice(-limit).reverse();
  }

  private write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    durationMs?: number
  ): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    const entry: LogEntrySummary = {
      timestamp: Date.now(),
      level,
      scope: this.scope,
      message,
      context,
      durationMs,
      error: error
        ? {
            name: error.name,
            message: error.message
          }
        : undefined
    };

    this.recentEntries.push(entry);
    while (this.recentEntries.length > 100) {
      this.recentEntries.shift();
    }

    const line = JSON.stringify(entry) + "\n";
    void fs.appendFile(this.logFilePath, line, "utf8");
  }
}

export interface LoggerFactory {
  createLogger: (scope: string) => Logger;
  getRecentEntries: (limit?: number) => LogEntrySummary[];
}

export async function createLoggerFactory(logDir: string, level: LogLevel): Promise<LoggerFactory> {
  await fs.mkdir(logDir, { recursive: true });
  const logFilePath = path.join(logDir, "app.log");
  const sharedEntries: LogEntrySummary[] = [];

  return {
    createLogger: (scope: string) => new Logger(scope, level, logFilePath, sharedEntries),
    getRecentEntries: (limit = 20) => sharedEntries.slice(-limit).reverse()
  };
}
