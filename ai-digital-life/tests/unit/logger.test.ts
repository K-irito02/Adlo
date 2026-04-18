import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLoggerFactory } from "@ai-digital-life/logger";

const tempDirs: string[] = [];

describe("logger", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it("stores structured context and duration in recent entries", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-logger-"));
    tempDirs.push(tempDir);
    const factory = await createLoggerFactory(tempDir, "debug");
    const logger = factory.createLogger("test");

    await logger.measure("measure operation", async () => {
      logger.info("plain log", { phase: "setup" });
      return "done";
    });

    const entries = factory.getRecentEntries(2);
    expect(entries[0]).toMatchObject({
      message: "measure operation"
    });
    expect(entries[0].durationMs).toBeTypeOf("number");
    expect(entries[1]).toMatchObject({
      message: "plain log",
      context: {
        phase: "setup"
      }
    });
  });
});
