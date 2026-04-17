import fs from "node:fs/promises";
import path from "node:path";
import { parentPort } from "node:worker_threads";
import type { RetrievalSnapshot } from "@ai-digital-life/kernel";
import { scanWorkspace } from "./lib/scan-workspace";

if (!parentPort) {
  throw new Error("Retrieval worker must run in a worker thread.");
}

const port = parentPort;

type StartIndexMessage = {
  type: "start-index";
  workspaceId: string;
  rootPath: string;
};

let activeRunToken = 0;

port.on("message", async (message: unknown) => {
  const payload = message as StartIndexMessage | { type: "shutdown" };

  if (payload.type === "shutdown") {
    process.exit(0);
  }

  if (payload.type !== "start-index") {
    return;
  }

  activeRunToken += 1;
  const runToken = activeRunToken;

  try {
    const snapshot = await scanWorkspace(
      payload.workspaceId,
      payload.rootPath,
      (progressSnapshot) => {
        port.postMessage({ type: "index-progress", snapshot: progressSnapshot });
      },
      () => runToken !== activeRunToken
    );

    if (runToken === activeRunToken) {
      port.postMessage({ type: "index-complete", snapshot });
    }
  } catch (error) {
    if (runToken !== activeRunToken) {
      return;
    }

    port.postMessage({
      type: "index-failed",
      snapshot: {
        workspaceId: payload.workspaceId,
        rootPath: payload.rootPath,
        status: "failed",
        scannedFiles: 0,
        indexedTextFiles: 0,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        lastError: error instanceof Error ? error.message : "Unknown retrieval worker error.",
        topExtensions: [],
        repoMap: []
      } satisfies RetrievalSnapshot
    });
  }
});
