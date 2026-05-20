import pty from "node-pty";
import path from "node:path";
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

const API_PREFIX = "/__adl_preview_api__";
const systemRoot = process.env.SystemRoot || "C:\\Windows";
const system32 = path.join(systemRoot, "System32");

interface PtySession {
  id: string;
  shell: string;
  cwd: string;
  process: pty.IPty;
  createdAt: number;
}

const sessions = new Map<string, PtySession>();
const allSseClients: Set<ServerResponse> = new Set();

/* ---- Shell resolution ---- */

type ShellKind = "powershell" | "cmd" | "bash";

interface ShellResolution {
  program: string;
  args: string[];
}

function systemCandidates(kind: ShellKind): string[] {
  switch (kind) {
    case "powershell":
      return [
        path.join(system32, "WindowsPowerShell", "v1.0", "powershell.exe"),
        path.join(systemRoot, "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ];
    case "cmd":
      return [
        process.env.COMSPEC || path.join(system32, "cmd.exe"),
        path.join(system32, "cmd.exe"),
      ];
    case "bash":
      return [
        path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
        path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
        path.join(system32, "wsl.exe"),
        path.join(systemRoot, "SysNative", "wsl.exe"),
      ];
  }
}

function shellArgsFor(kind: ShellKind, programPath: string): string[] {
  const name = path.basename(programPath, ".exe").toLowerCase();
  switch (name) {
    case "powershell":
    case "pwsh":
      return ["-NoLogo", "-NoProfile"];
    case "cmd":
      return [];
    case "bash":
      return path.basename(programPath).toLowerCase().includes("wsl") ? [] : [];
    default:
      return [];
  }
}

function resolveShell(shell: string): { resolution: ShellResolution } | { error: string } {
  const kind = shell as ShellKind;
  if (!["powershell", "cmd", "bash"].includes(kind)) {
    return { error: `Unknown shell type: ${shell}` };
  }

  for (const candidate of systemCandidates(kind)) {
    if (existsSync(candidate)) {
      return {
        resolution: {
          program: candidate,
          args: shellArgsFor(kind, candidate),
        },
      };
    }
  }

  const progName = kind === "powershell" ? "powershell.exe" : kind === "cmd" ? "cmd.exe" : "bash.exe";
  return {
    resolution: {
      program: progName,
      args: shellArgsFor(kind, progName),
    },
  };
}

function createId(): string {
  return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendSse(sessionId: string, data: string): void {
  const payload = `data: ${JSON.stringify({ sessionId, data })}\n\n`;
  const dead: ServerResponse[] = [];
  for (const res of allSseClients) {
    try {
      res.write(payload);
    } catch {
      dead.push(res);
    }
  }
  for (const d of dead) allSseClients.delete(d);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response: ServerResponse, payload: unknown, status = 200): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function isPreviewTerminalApiRequest(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes(`${API_PREFIX}/pty/`);
}

export async function handlePreviewTerminalApi(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const requestUrl = new URL(request.url ?? API_PREFIX, "http://127.0.0.1");

  // POST /__adl_preview_api__/pty/create
  if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/pty/create`) {
    const body = (await readBody(request)) as { shell?: string; cwd?: string; cols?: number; rows?: number } | undefined;
    const shell = body?.shell || "powershell";
    const cwd = body?.cwd || process.cwd();
    const sessionId = createId();

    const resolved = resolveShell(shell);
    if ("error" in resolved) {
      sendSse(sessionId, `\r\n[error: ${resolved.error}]\r\n`);
      writeJson(response, { ok: true, data: { sessionId } });
      return true;
    }

    const { resolution } = resolved;
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(resolution.program, resolution.args, {
        name: "xterm-256color",
        cols: body?.cols || 80,
        rows: body?.rows || 24,
        cwd,
        env: { ...process.env, TERM: "xterm-256color" },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendSse(sessionId, `\r\n[error: failed to start shell: ${msg}]\r\n`);
      writeJson(response, { ok: true, data: { sessionId } });
      return true;
    }

    const session: PtySession = {
      id: sessionId,
      shell,
      cwd,
      process: ptyProcess,
      createdAt: Date.now(),
    };
    sessions.set(sessionId, session);

    ptyProcess.onData((data: string) => {
      sendSse(sessionId, data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      sendSse(sessionId, `\r\n[process exited] (code=${exitCode})\r\n`);
      sessions.delete(sessionId);
    });

    writeJson(response, { ok: true, data: { sessionId } });
    return true;
  }

  // POST /__adl_preview_api__/pty/input
  if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/pty/input`) {
    const body = (await readBody(request)) as { sessionId?: string; data?: string } | undefined;
    if (!body?.sessionId || body.data === undefined) {
      writeJson(response, { ok: false, error: { code: "INVALID_INPUT", message: "sessionId and data required" } }, 400);
      return true;
    }
    const session = sessions.get(body.sessionId);
    if (!session) {
      writeJson(response, { ok: false, error: { code: "NOT_FOUND", message: "session not found" } }, 404);
      return true;
    }
    try {
      session.process.write(body.data);
    } catch {
      writeJson(response, { ok: false, error: { code: "WRITE_ERROR", message: "failed to write to pty stdin" } }, 500);
      return true;
    }
    writeJson(response, { ok: true, data: true });
    return true;
  }

  // POST /__adl_preview_api__/pty/resize
  if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/pty/resize`) {
    const body = (await readBody(request)) as { sessionId?: string; cols?: number; rows?: number } | undefined;
    if (!body?.sessionId || body.cols === undefined || body.rows === undefined) {
      writeJson(response, { ok: false, error: { code: "INVALID_INPUT", message: "sessionId, cols and rows required" } }, 400);
      return true;
    }
    const session = sessions.get(body.sessionId);
    if (!session) {
      writeJson(response, { ok: false, error: { code: "NOT_FOUND", message: "session not found" } }, 404);
      return true;
    }
    try {
      session.process.resize(body.cols, body.rows);
    } catch {
      writeJson(response, { ok: false, error: { code: "RESIZE_ERROR", message: "failed to resize pty" } }, 500);
      return true;
    }
    writeJson(response, { ok: true, data: true });
    return true;
  }

  // POST /__adl_preview_api__/pty/kill
  if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/pty/kill`) {
    const body = (await readBody(request)) as { sessionId?: string } | undefined;
    if (!body?.sessionId) {
      writeJson(response, { ok: false, error: { code: "INVALID_INPUT", message: "sessionId required" } }, 400);
      return true;
    }
    const session = sessions.get(body.sessionId);
    if (session) {
      session.process.kill();
      sessions.delete(body.sessionId);
    }
    writeJson(response, { ok: true, data: true });
    return true;
  }

  // GET /__adl_preview_api__/pty/list
  if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/pty/list`) {
    const infos = Array.from(sessions.entries()).map(([id, s]) => ({
      sessionId: id,
      shell: s.shell,
      cwd: s.cwd,
      cols: 80,
      rows: 24,
      status: "Running" as const,
    }));
    writeJson(response, { ok: true, data: infos });
    return true;
  }

  // GET /__adl_preview_api__/pty/output (SSE - all sessions)
  if (request.method === "GET" && requestUrl.pathname === `${API_PREFIX}/pty/output`) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const thisClient = response;
    allSseClients.add(thisClient);

    const keepAlive = setInterval(() => {
      try {
        thisClient.write(": keepalive\n\n");
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    request.on("close", () => {
      clearInterval(keepAlive);
      allSseClients?.delete(thisClient);
    });

    return true;
  }

  return false;
}
