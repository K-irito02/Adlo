import type { PtyOutputEvent } from "../shared/ipc/pty";

export const MAX_PTY_LISTENERS = 32;
export const ptyOutputListeners = new Set<(event: PtyOutputEvent) => void>();
export const activeMockPtySessions = new Map<string, { shell: string; inputBuffer: string }>();

export function emitPtyOutput(sessionId: string, data: string): void {
  const event: PtyOutputEvent = { sessionId, data };
  ptyOutputListeners.forEach((fn) => fn(event));
}

export function getMockPrompt(shell: string): string {
  if (shell === "cmd") return "C:\\Users\\user>";
  if (shell === "bash") return "user@host:~$ ";
  return "PS C:\\Users\\user>";
}

export function executeMockCommand(cmd: string, shell: string): string | undefined {
  if (!cmd) return undefined;
  const parts = cmd.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (command === "echo") {
    return args.join(" ");
  }
  if (command === "dir" || command === "ls") {
    return `2026/05/19  10:00    <DIR>          .\r\n2026/05/19  10:00    <DIR>          ..\r\n2026/05/19  10:00             1024  README.md\r\n2026/05/19  10:00            24576  package.json\r\n2026/05/19  10:00              512  index.ts`;
  }
  if (command === "pwd" || command === "cd") {
    return undefined;
  }
  if (command === "date") {
    return new Date().toLocaleString("zh-CN");
  }
  if (command === "whoami") {
    return "user";
  }
  if (command === "help") {
    return `Available commands: echo, dir/ls, pwd, cd, date, whoami, help, cls/clear`;
  }
  return `'${command}' is not recognized as an internal or external command, operable program or batch file.`;
}