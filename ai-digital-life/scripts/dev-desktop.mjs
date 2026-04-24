import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronEnv,
  normalizeDevServerUrl,
  sanitizeSpawnEnv,
  resolveNpmSpawn,
  DEFAULT_DEV_SERVER_URL
} from "./dev-desktop-utils.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devServerUrl = normalizeDevServerUrl(process.env.ADL_RENDERER_DEV_URL ?? DEFAULT_DEV_SERVER_URL);
const childProcesses = new Set();
let shuttingDown = false;

function spawnProcess(args, options = {}) {
  const spawnTarget = resolveNpmSpawn(args, process.platform);
  const child = spawn(spawnTarget.command, spawnTarget.args, {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: sanitizeSpawnEnv(process.env),
    shell: spawnTarget.shell,
    ...options
  });

  childProcesses.add(child);
  child.once("exit", () => {
    childProcesses.delete(child);
  });

  return child;
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with code ${code ?? "null"}${signal ? ` (signal: ${signal})` : ""}.`));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requestOk(url) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET"
      },
      (response) => {
        response.resume();
        resolve(response.statusCode && response.statusCode < 500);
      }
    );

    request.on("error", reject);
    request.setTimeout(2_000, () => {
      request.destroy(new Error("Timed out while waiting for the renderer dev server."));
    });
    request.end();
  });
}

async function waitForServer(urlString, timeoutMs = 30_000) {
  const url = new URL(urlString);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (await requestOk(url)) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await delay(500);
  }

  throw new Error(`Renderer dev server did not become ready within ${timeoutMs}ms at ${urlString}.`);
}

function terminateChildren(signal = "SIGTERM") {
  for (const child of [...childProcesses]) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

async function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  terminateChildren();
  await delay(300);
  terminateChildren("SIGKILL");
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(0);
  });
}

async function main() {
  console.log(`[adl-dev] Building main and preload for Electron...`);
  await waitForExit(spawnProcess(["run", "build:main", "-w", "@ai-digital-life/desktop"]), "build:main");
  await waitForExit(spawnProcess(["run", "build:preload", "-w", "@ai-digital-life/desktop"]), "build:preload");

  console.log(`[adl-dev] Starting renderer dev server at ${devServerUrl} ...`);
  const renderer = spawnProcess(["run", "dev", "-w", "@ai-digital-life/desktop"]);
  renderer.once("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[adl-dev] Renderer dev server exited unexpectedly with code ${code ?? "null"}.`);
      void shutdown(code ?? 1);
    }
  });

  await waitForServer(devServerUrl);

  console.log(`[adl-dev] Renderer ready. Launching Electron...`);
  const electron = spawnProcess(["run", "start", "-w", "@ai-digital-life/desktop"], {
    env: createElectronEnv(devServerUrl)
  });

  electron.once("exit", (code) => {
    if (!shuttingDown) {
      void shutdown(code ?? 0);
    }
  });

  await waitForExit(electron, "desktop:start");
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[adl-dev] ${message}`);
  await shutdown(1);
});
