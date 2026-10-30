/**
 * 隔离数据目录启动 adl-server（本地验证/排障用）。
 *
 * 解决两个重复踩到的坑：
 * - 手动跑 `target/debug/adl-server.exe` 时忘了重新构建，读到的是旧二进制
 *   （2026-10-30：`/dsh/source-status` 还返回已删除字段，导致误判）；
 * - 临时数据目录、locator 覆盖、随机端口每次手拼，容易污染真实 `%APPDATA%`。
 *
 * 用法：
 *   node scripts/serve-adl-server.mjs [--no-build] [--data-dir <dir>] [--port <0|n>] [--keep]
 * 默认：先 `cargo build -p adl-server`，再在临时目录启动，打印 URL 与 proxyEffective。
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const implRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
const serverExe = path.join(
  implRoot,
  "target",
  "debug",
  process.platform === "win32" ? "adl-server.exe" : "adl-server",
);

export function parseArgs(argv) {
  const options = { noBuild: false, dataDir: null, port: 0, keep: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--no-build") {
      options.noBuild = true;
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg === "--data-dir") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error("missing value for --data-dir");
      }
      options.dataDir = value;
      i += 1;
    } else if (arg === "--port") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new Error("--port must be an integer between 0 and 65535");
      }
      options.port = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

async function printProxyHealth(url) {
  try {
    const response = await fetch(`${url}/dsh/source-status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json();
    const effective = payload?.data?.proxyEffective;
    if (effective) {
      console.log(`[adl-serve] proxyEffective=${JSON.stringify(effective)}`);
    }
  } catch {
    // 状态探测失败不阻塞启动；用户仍可用打印出的 URL。
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[adl-serve] ${error.message}`);
    process.exit(1);
  }
  if (options.help) {
    console.log(
      "usage: node scripts/serve-adl-server.mjs [--no-build] [--data-dir <dir>] [--port <n>] [--keep]",
    );
    return;
  }

  if (!options.noBuild) {
    console.log("[adl-serve] building adl-server (cargo build -p adl-server)...");
    const build = spawnSync(cargo, ["build", "-p", "adl-server"], {
      cwd: implRoot,
      stdio: "inherit",
    });
    if (build.status !== 0) {
      console.error("[adl-serve] build failed");
      process.exit(build.status ?? 1);
    }
  }

  const explicitDataDir = options.dataDir ? path.resolve(options.dataDir) : null;
  const dataDir = explicitDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "adl-server-"));
  fs.mkdirSync(dataDir, { recursive: true });

  const child = spawn(serverExe, ["--port", String(options.port), "--data-dir", dataDir], {
    cwd: implRoot,
    env: { ...process.env, ADL_STORAGE_LOCATOR_PATH: path.join(dataDir, "storage-locator.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let closed = false;
  const cleanup = () => {
    if (closed) {
      return;
    }
    closed = true;
    try {
      child.kill();
    } catch {
      // 已退出。
    }
    if (!explicitDataDir && !options.keep) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } else {
      console.log(`[adl-serve] data dir kept: ${dataDir}`);
    }
  };

  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    pending += chunk;
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      const match = /^AD_SERVER_PORT=(\d+)$/.exec(line);
      if (match) {
        const url = `http://127.0.0.1:${match[1]}`;
        console.log(`[adl-serve] url=${url} data=${dataDir}`);
        void printProxyHealth(url);
      }
      newline = pending.indexOf("\n");
    }
  });
  child.stderr.pipe(process.stderr);

  child.once("error", (error) => {
    console.error(`[adl-serve] failed to start ${serverExe}: ${error.message}`);
    cleanup();
    process.exit(1);
  });
  child.once("exit", (code) => {
    console.log(`[adl-serve] server exited (code=${code ?? 0})`);
    cleanup();
    process.exit(code ?? 0);
  });

  const stop = () => {
    cleanup();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  main();
}
