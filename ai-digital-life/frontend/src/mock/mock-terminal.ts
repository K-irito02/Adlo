import type { PtyBridge } from "../shared/ipc";
import {
  activeMockPtySessions,
  emitPtyOutput,
  executeMockCommand,
  getMockPrompt,
  MAX_PTY_LISTENERS,
  ptyOutputListeners,
} from "./mock-shared";

export const mockPty: PtyBridge = {
  create: async (input) => {
    const sessionId = `pty-mock-${Date.now()}`;
    const shell = input.shell ?? "powershell";
    activeMockPtySessions.set(sessionId, { shell, inputBuffer: "" });
    const welcome = shell === "cmd"
      ? `Microsoft Windows [Version 10.0.22621.1]\r\n(c) Microsoft Corporation. All rights reserved.\r\n\r\nC:\\Users\\user>`
      : shell === "bash"
        ? `user@host:~$\x20`
        : `Windows PowerShell\r\nCopyright (C) Microsoft Corporation. All rights reserved.\r\n\r\nPS C:\\Users\\user>`;
    setTimeout(() => emitPtyOutput(sessionId, welcome), 50);
    return { ok: true, data: { sessionId } };
  },
  input: async (sessionId, data) => {
    const session = activeMockPtySessions.get(sessionId);
    if (!session) {
      return { ok: true, data: true };
    }
    if (data === "\r") {
      const cmd = session.inputBuffer.trim();
      session.inputBuffer = "";
      emitPtyOutput(sessionId, "\r\n");
      if (cmd === "clear" || cmd === "cls") {
        return { ok: true, data: true };
      }
      const output = executeMockCommand(cmd, session.shell);
      if (output) {
        emitPtyOutput(sessionId, output + "\r\n");
      }
      emitPtyOutput(sessionId, getMockPrompt(session.shell));
    } else if (data === "\x7f") {
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitPtyOutput(sessionId, "\b \b");
      }
    } else {
      session.inputBuffer += data;
      emitPtyOutput(sessionId, data);
    }
    return { ok: true, data: true };
  },
  resize: async () => ({ ok: true, data: true }),
  kill: async (sessionId) => {
    activeMockPtySessions.delete(sessionId);
    return { ok: true, data: true };
  },
  list: async () => ({ ok: true, data: [] })
};