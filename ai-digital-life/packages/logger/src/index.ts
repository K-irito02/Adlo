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

  debug(message: string): void {
    this.write("debug", message);
  }

  info(message: string): void {
    this.write("info", message);
  }

  warn(message: string): void {
    this.write("warn", message);
  }

  error(message: string): void {
    this.write("error", message);
  }

  getRecentEntries(limit = 20): LogEntrySummary[] {
    return this.recentEntries.slice(-limit).reverse();
  }

  private write(level: LogLevel, message: string): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    const entry: LogEntrySummary = {
      timestamp: Date.now(),
      level,
      scope: this.scope,
      message
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
