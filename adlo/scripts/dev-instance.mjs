/**
 * Dev-instance helpers shared by `dev:stop`, `check-rust-changed` and `worktree:env`.
 *
 * The desktop app and its adl-server child live under `<adlo>/target/debug/`.
 * A running instance keeps both images open, which makes sidecar staging and
 * `cargo check -p adlo` fail with `PermissionDenied`. Detection is path-scoped so
 * another worktree's instance (or an installed release build) is never touched.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { INSTANCE_STATE_DIRNAME } from "./instance-id.mjs";

export function devExecutables(repoRoot) {
  const base = path.join(path.resolve(repoRoot), "target", "debug");
  return {
    app: path.join(base, process.platform === "win32" ? "adlo.exe" : "adlo"),
    server: path.join(base, process.platform === "win32" ? "adl-server.exe" : "adl-server"),
  };
}

/** True when the file exists and cannot be opened for writing (typically a running image). */
export function isExeLocked(file) {
  try {
    const fd = fs.openSync(file, "r+");
    fs.closeSync(fd);
    return false;
  } catch (error) {
    return !(error && error.code === "ENOENT");
  }
}

/** Paths among this worktree's dev images that are currently locked by a running process. */
export function findLockedDevExecutables(repoRoot) {
  const { app, server } = devExecutables(repoRoot);
  return [app, server].filter((file) => isExeLocked(file));
}

function killLauncher(markerPath) {
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch {
    return;
  }
  const pid = Number(marker?.launcherPid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

export function stopDevInstances(repoRoot) {
  const root = path.resolve(repoRoot);
  const { app, server } = devExecutables(root);
  const marker = path.join(root, INSTANCE_STATE_DIRNAME, "dev-instance.json");
  killLauncher(marker);

  if (process.platform === "win32") {
    const quoted = [app, server].map((file) => file.replace(/'/g, "''"));
    const script =
      `$targets = @('${quoted[0]}', '${quoted[1]}'); ` +
      `Get-Process -ErrorAction SilentlyContinue | Where-Object { $targets -contains $_.Path } | ` +
      `Stop-Process -Force -ErrorAction SilentlyContinue`;
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
    });
  } else {
    const ps = spawnSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" });
    for (const line of (ps.stdout ?? "").split(/\r?\n/)) {
      if (!line.includes(app) && !line.includes(server)) {
        continue;
      }
      const pid = Number(line.trim().split(/\s+/, 1)[0]);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already gone
        }
      }
    }
  }

  return { app, server };
}

/** Wait until the dev images are no longer locked. Resolves to the files still locked. */
export function waitForDevUnlock(repoRoot, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const probe = () => {
      const locked = findLockedDevExecutables(repoRoot);
      if (locked.length === 0 || Date.now() >= deadline) {
        resolve(locked);
        return;
      }
      setTimeout(probe, 50);
    };
    probe();
  });
}

/** A one-line hint for fail-fast messages. */
export function devStopHint() {
  return "先运行 `pnpm run dev:stop`（在 adlo/ 下）后再重试";
}
