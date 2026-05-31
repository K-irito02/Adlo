export type ToolId = "files" | "changes" | "browser" | "terminal" | "audit" | "settings" | "models";
export type ChatMode = "plan" | "debug" | "ask";
export type TerminalProfile = "powershell" | "bash" | "cmd";
export type FilesNavigatorMode = "tree" | "search" | "outline";
export type ChangesNavigatorMode = "tree" | "list" | "outline";

export interface ContextChip {
  id: string;
  kind: "file" | "doc" | "url" | "codebase" | "skill" | "model" | "mcp";
  label: string;
  detail?: string;
}
