import net from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const isMain = Boolean(process.argv[1]) && (process.platform === "win32"
  ? path.resolve(process.argv[1]).toLowerCase() === __filename.toLowerCase()
  : path.resolve(process.argv[1]) === __filename);

const modeArg = (process.argv[2] ?? "tauri").toLowerCase();
const modeAliases = {
  app: "tauri",
  browser: "browser",
  both: "both",
  external: "tauri",
  tauri: "tauri",
};
const mode = modeAliases[modeArg];

if (!mode && isMain) {
  console.error(`Unsupported mode "${modeArg}". Use browser, tauri, both, app, or external.`);
  process.exit(1);
}

const host = process.env.ADL_HOST ?? "127.0.0.1";
const cargoCommand = process.platform === "win32" ? "cargo.exe" : "cargo";
const viteEntry = path.join(repoRoot, "frontend", "node_modules", "vite", "bin", "vite.js");
const appImageName = process.platform === "win32" ? "ai-digital-life.exe" : "ai-digital-life";
const appDevExePath = path.join(repoRoot, "target", "debug", "ai-digital-life.exe");
const children = [];

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    void shutdown(1);
  });
}

async function main() {
  const requestedPort = parsePort(process.env.ADL_PORT ?? process.env.PORT);
  const port = requestedPort ?? (await findOpenPort(host));
  const devUrl = `http://${host}:${port}`;

  console.log(`[adl-run] mode=${mode} url=${devUrl}`);

  const vite = spawnChecked(
    process.execPath,
    [viteEntry, "--host", host, "--port", String(port)],
    { ADL_HOST: host, ADL_PORT: String(port), PORT: String(port) },
    path.join(repoRoot, "frontend"),
  );
  children.push(vite);

  await waitForHttp(devUrl, 30_000);
  console.log(`[adl-run] frontend ready at ${devUrl}`);

  if (mode === "browser") {
    console.log("[adl-run] browser mode keeps only the Vite dev server running.");
    console.log(`[adl-run] open ${devUrl}`);
    await holdUntilStopped();
    return;
  }

  // Windows: a leftover app instance locks target/debug/ai-digital-life.exe, which
  // blocks cargo from relinking changed code (tauri dev runs `cargo run` internally).
  // Kill it only when the dev exe is actually locked, right before the dev build, to
  // avoid killing legitimate instances that do not hold the lock. Unix linkers replace
  // the binary via rename, so the lock problem does not exist there.
  if (process.platform === "win32" && isExeLocked(appDevExePath)) {
    await killProcessesByName(appImageName);
  }

  const tauriConfig = JSON.stringify({
    build: {
      devUrl,
    },
  });

  const tauri = spawnChecked(
    cargoCommand,
    ["tauri", "dev", "--config", tauriConfig],
    { ADL_HOST: host, ADL_PORT: String(port), PORT: String(port) },
  );
  children.push(tauri);

  if (mode === "both") {
    console.log(`[adl-run] browser preview remains available at ${devUrl}`);
  }

  await holdUntilStopped();
}

function spawnChecked(command, args, envOverrides, cwd = repoRoot) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  child.once("error", (error) => {
    console.error(`[adl-run] failed to start ${command}: ${error.message}`);
    void shutdown(1);
  });

  child.once("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[adl-run] ${command} exited via signal ${signal}`);
      void shutdown(1);
      return;
    }

    if ((code ?? 0) !== 0) {
      console.error(`[adl-run] ${command} exited with code ${code}`);
      void shutdown(code ?? 1);
      return;
    }

    if (command === cargoCommand) {
      void shutdown(0);
    }
  });

  return child;
}

function parsePort(value) {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

async function findOpenPort(hostname) {
  const preferredBase = 5173;
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = preferredBase + offset;
    if (await isPortOpen(hostname, candidate)) {
      continue;
    }
    return candidate;
  }

  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve an ephemeral port."));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

// Check if a port is already in use (returns true if someone is listening).
async function isPortOpen(hostname, port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Ignore transient boot failures and keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let isShuttingDown = false;

async function shutdown(exitCode) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  const activeChildren = children.filter((child) => child && !child.killed);
  await Promise.all(activeChildren.map((child) => terminateChild(child.pid)));
  process.exit(exitCode);
}

async function terminateChild(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.once("exit", () => resolve(undefined));
      killer.once("error", () => resolve(undefined));
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Ignore already-exited processes.
  }
}

function isExeLocked(file) {
  try {
    const fd = fs.openSync(file, "r+");
    fs.closeSync(fd);
    return false;
  } catch (error) {
    if (["EBUSY", "EPERM", "EACCES"].includes(error.code)) {
      return true;
    }
    if (error.code !== "ENOENT") {
      console.warn(`[adl-run] unable to probe ${file}: ${error.code ?? error.message}`);
    }
    return false;
  }
}

export async function killProcessesByName(imageName) {
  console.log(`[adl-run] killing stale ${imageName} processes to release the dev binary lock`);
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/F", "/IM", imageName, "/T"], { stdio: "ignore" });
      killer.once("exit", (code) => {
        if (code !== 0 && code !== 128) {
          console.warn(`[adl-run] taskkill ${imageName} exited with code ${code}`);
        }
        resolve(undefined);
      });
      killer.once("error", (error) => {
        console.warn(`[adl-run] failed to run taskkill for ${imageName}: ${error.message}`);
        resolve(undefined);
      });
    });
    return;
  }

  await new Promise((resolve) => {
    const killer = spawn("pkill", ["-x", imageName], { stdio: "ignore" });
    killer.once("exit", (code) => {
      if (code !== 0 && code !== 1) {
        console.warn(`[adl-run] pkill ${imageName} exited with code ${code}`);
      }
      resolve(undefined);
    });
    killer.once("error", (error) => {
      console.warn(`[adl-run] failed to run pkill for ${imageName}: ${error.message}`);
      resolve(undefined);
    });
  });
}

if (isMain) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      void shutdown(0);
    });
  }
}

// Keep the process alive indefinitely until a signal (SIGINT/SIGTERM) triggers shutdown.
// The unresolved promise blocks the event loop from exiting, while the signal handlers
// registered above call shutdown() to terminate children and exit.
async function holdUntilStopped() {
  await new Promise(() => {});
}
