import { spawn, type ChildProcess } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

const API_PREFIX = "/__adl_preview_api__";

interface PtySession {
  id: string;
  shell: string;
  cwd: string;
  child: ChildProcess;
  createdAt: number;
}

const sessions = new Map<string, PtySession>();
const sseClients = new Map<string, Set<ServerResponse>>();
const allSseClients: Set<ServerResponse> = new Set();

function createId(): string {
  return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findShellPath(shell: string): string {
  switch (shell) {
    case "cmd":
      return process.env.COMSPEC || "cmd.exe";
    case "powershell":
      return "powershell.exe";
    case "bash":
      return "wsl.exe";
    default:
      return process.env.COMSPEC || "cmd.exe";
  }
}

function findShellArgs(shell: string): string[] {
  switch (shell) {
    case "cmd":
      return [];
    case "powershell":
      return ["-NoLogo", "-NoProfile"];
    case "bash":
      return ["bash", "-l"];
    default:
      return [];
  }
}

function sendSse(sessionId: string, data: string): void {
  const payload = `data: ${JSON.stringify({ sessionId, data })}\n\n`;
  for (const res of allSseClients) {
    try {
      res.write(payload);
    } catch {
      allSseClients.delete(res);
    }
  }
  const clients = sseClients.get(sessionId);
  if (clients) {
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  }
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

    const shellPath = findShellPath(shell);
    const shellArgs = findShellArgs(shell);

    const child = spawn(shellPath, shellArgs, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, TERM: "xterm-256color" },
    });

    const session: PtySession = {
      id: sessionId,
      shell,
      cwd,
      child,
      createdAt: Date.now(),
    };
    sessions.set(sessionId, session);

    child.stdout?.on("data", (chunk: Buffer) => {
      sendSse(sessionId, chunk.toString("utf8"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      sendSse(sessionId, chunk.toString("utf8"));
    });

    child.on("exit", () => {
      sendSse(sessionId, "\r\n[process exited]\r\n");
      sessions.delete(sessionId);
      sseClients.delete(sessionId);
    });

    child.on("error", () => {
      sessions.delete(sessionId);
      sseClients.delete(sessionId);
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
    session.child.stdin?.write(body.data);
    writeJson(response, { ok: true, data: true });
    return true;
  }

  // POST /__adl_preview_api__/pty/resize
  if (request.method === "POST" && requestUrl.pathname === `${API_PREFIX}/pty/resize`) {
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
      session.child.kill();
      sessions.delete(body.sessionId);
      sseClients.delete(body.sessionId);
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
