import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanWorkspace } from "../../workers/health/src/lib/scan-workspace";

const tempDirs: string[] = [];

describe("retrieval worker", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it("indexes files and produces repo map metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "adl-retrieval-"));
    tempDirs.push(tempDir);
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "package.json"), "{}", "utf8");
    await fs.writeFile(path.join(tempDir, "src", "index.ts"), "export const value = 1;", "utf8");
    await fs.writeFile(path.join(tempDir, "README.md"), "# demo", "utf8");
    await fs.writeFile(path.join(tempDir, ".git", "ignored.txt"), "ignored", "utf8");

    const progressEvents: number[] = [];
    const snapshot = await scanWorkspace(
      "workspace-1",
      tempDir,
      (progress) => {
        progressEvents.push(progress.scannedFiles);
      },
      () => false
    );

    expect(snapshot.status).toBe("completed");
    expect(snapshot.scannedFiles).toBe(3);
    expect(snapshot.indexedTextFiles).toBe(3);
    expect(snapshot.repoMap.some((entry) => entry.path === path.join("src", "index.ts"))).toBe(true);
    expect(snapshot.repoMap.some((entry) => entry.path.includes(".git"))).toBe(false);
    expect(snapshot.topExtensions.some((entry) => entry.extension === ".ts")).toBe(true);
    expect(progressEvents.length).toBeGreaterThan(0);
  });
});
