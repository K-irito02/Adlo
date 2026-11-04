import pty from 'node-pty';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { WebSocket, WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'node:http';

const systemRoot = process.env.SystemRoot || 'C:\\Windows';
const system32 = path.join(systemRoot, 'System32');

interface PtySession {
  id: string;
  shell: string;
  cwd: string;
  process: pty.IPty;
  createdAt: number;
}

const sessions = new Map<string, PtySession>();

/* ---- Shell resolution ---- */

type ShellKind = 'powershell' | 'cmd' | 'bash';

interface ShellResolution {
  program: string;
  args: string[];
}

function systemCandidates(kind: ShellKind): string[] {
  switch (kind) {
    case 'powershell':
      return [
        path.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        path.join(systemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ];
    case 'cmd':
      return [
        process.env.COMSPEC || path.join(system32, 'cmd.exe'),
        path.join(system32, 'cmd.exe'),
      ];
    case 'bash':
      return [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
        path.join(
          process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
          'Git',
          'bin',
          'bash.exe',
        ),
        path.join(system32, 'wsl.exe'),
        path.join(systemRoot, 'SysNative', 'wsl.exe'),
      ];
  }
}

function shellArgsFor(programPath: string): string[] {
  const name = path.basename(programPath).toLowerCase();
  if (name.includes('powershell') || name === 'pwsh.exe') {
    return ['-NoLogo', '-NoProfile'];
  } else if (name === 'cmd.exe') {
    return ['/q'];
  } else if (name === 'bash.exe') {
    return ['-l'];
  } else if (name === 'wsl.exe') {
    return [];
  }
  return [];
}

function resolveShell(shell: string): { resolution: ShellResolution } | { error: string } {
  const kind = shell as ShellKind;
  if (!['powershell', 'cmd', 'bash'].includes(kind)) {
    return { error: `Unknown shell type: ${shell}` };
  }

  for (const candidate of systemCandidates(kind)) {
    if (existsSync(candidate)) {
      console.debug(`Shell resolved to system path: ${candidate}`);
      return {
        resolution: {
          program: candidate,
          args: shellArgsFor(candidate),
        },
      };
    }
  }

  let progName: string;
  let args: string[];

  switch (kind) {
    case 'powershell':
      progName = 'powershell.exe';
      args = ['-NoLogo', '-NoProfile'];
      break;
    case 'cmd':
      progName = 'cmd.exe';
      args = ['/q'];
      break;
    case 'bash': {
      const wslPath = path.join(system32, 'wsl.exe');
      if (existsSync(wslPath)) {
        progName = 'wsl.exe';
        args = [];
      } else {
        progName = 'bash.exe';
        args = ['-l'];
      }
      break;
    }
  }

  console.debug(`Shell falling back to PATH resolution: ${progName}`);
  return {
    resolution: {
      program: progName,
      args,
    },
  };
}

function createId(): string {
  return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 空 cwd 时解析用户主目录（与 crates/server pty_ws.rs default_terminal_cwd 对齐） */
function defaultCwd(): string {
  return process.env.USERPROFILE || process.env.HOME || process.cwd();
}

/* ---- /pty WebSocket protocol ---- */

/**
 * Serve the `/pty` WebSocket protocol (the same one `crates/server/src/pty_ws.rs`
 * implements) over the Vite dev server, backed by node-pty. This keeps the
 * browser preview fully functional while the preview still runs without a real
 * ad-server; once the preview spawns the real ad-server (Task 9) the same
 * frontend `/pty` WebSocket client talks to it instead.
 */
export function setupPreviewTerminalWs(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '', 'http://127.0.0.1').pathname;
    if (pathname !== '/pty') {
      return; // leave Vite's HMR upgrade and everything else alone
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const createdByConnection: string[] = [];

    const send = (frame: unknown): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(frame));
      }
    };

    ws.on('message', (raw: Buffer) => {
      let frame: {
        kind?: string;
        sessionId?: string;
        data?: string;
        cols?: number;
        rows?: number;
        shell?: string;
        cwd?: string;
      };
      try {
        frame = JSON.parse(raw.toString('utf8')) as typeof frame;
      } catch {
        send({ kind: 'error', message: 'invalid JSON frame' });
        return;
      }

      const kind = frame.kind;
      if (kind === 'ping') {
        // 心跳保活：连接层处理，与 ad-server 行为一致
        send({ kind: 'pong' });
        return;
      }
      if (kind === 'create') {
        const shell = frame.shell && frame.shell !== '' ? frame.shell : 'powershell';
        const cwd = frame.cwd && frame.cwd !== '' ? frame.cwd : defaultCwd();
        const cols = frame.cols ?? 80;
        const rows = frame.rows ?? 24;
        const sessionId = createId();
        const resolved = resolveShell(shell);
        if ('error' in resolved) {
          send({ kind: 'error', message: resolved.error });
          return;
        }
        const { resolution } = resolved;
        let ptyProcess: pty.IPty;
        try {
          ptyProcess = pty.spawn(resolution.program, resolution.args, {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env: { ...process.env, TERM: 'xterm-256color' },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          send({ kind: 'error', message: `failed to start shell: ${msg}` });
          return;
        }

        sessions.set(sessionId, {
          id: sessionId,
          shell,
          cwd,
          process: ptyProcess,
          createdAt: Date.now(),
        });
        createdByConnection.push(sessionId);
        ptyProcess.onData((data: string) => send({ kind: 'output', sessionId, data }));
        ptyProcess.onExit(() => {
          sessions.delete(sessionId);
          send({ kind: 'terminated', sessionId });
        });
        send({ kind: 'created', sessionId });
        return;
      }

      if (kind === 'input') {
        const session = frame.sessionId ? sessions.get(frame.sessionId) : undefined;
        if (!session) {
          send({ kind: 'error', sessionId: frame.sessionId, message: 'session not found' });
          return;
        }
        try {
          session.process.write(frame.data ?? '');
        } catch {
          send({
            kind: 'error',
            sessionId: frame.sessionId,
            message: 'failed to write to pty stdin',
          });
        }
        return;
      }

      if (kind === 'resize') {
        const session = frame.sessionId ? sessions.get(frame.sessionId) : undefined;
        if (!session) {
          send({ kind: 'error', sessionId: frame.sessionId, message: 'session not found' });
          return;
        }
        try {
          session.process.resize(frame.cols ?? 80, frame.rows ?? 24);
        } catch {
          send({ kind: 'error', sessionId: frame.sessionId, message: 'failed to resize pty' });
        }
        return;
      }

      if (kind === 'kill') {
        const session = frame.sessionId ? sessions.get(frame.sessionId) : undefined;
        if (session) {
          // kill 触发进程退出 → onExit 回调统一发送 terminated，避免重复帧
          session.process.kill();
          sessions.delete(frame.sessionId as string);
        }
        return;
      }

      send({ kind: 'error', message: `unknown frame kind: ${kind ?? '<missing>'}` });
    });

    ws.on('close', () => {
      for (const sessionId of createdByConnection) {
        const session = sessions.get(sessionId);
        if (session) {
          session.process.kill();
          sessions.delete(sessionId);
        }
      }
    });
  });
}
