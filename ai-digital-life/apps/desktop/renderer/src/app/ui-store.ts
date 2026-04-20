import { create } from "zustand";

/**
 * Renderer-only UI state.
 *
 * Purely cosmetic or navigation state that does not need to cross the IPC
 * boundary lives here. Persistence to disk (if any) happens via `localStorage`
 * behind the IPC-approved preferences bridge, not this store directly.
 */

export type ToolId = "files" | "changes" | "browser" | "terminal";

export type ChatMode = "plan" | "debug" | "ask";

export interface ContextChip {
  id: string;
  kind: "file" | "doc" | "url" | "codebase" | "skill" | "model" | "mcp";
  label: string;
  detail?: string;
}

const LEFT_COLLAPSED_KEY = "adl-ui:left-collapsed";
const RIGHT_COLLAPSED_KEY = "adl-ui:right-collapsed";
const ACTIVE_TOOL_KEY = "adl-ui:active-tool";
const SESSION_TABS_EXPANDED_KEY = "adl-ui:session-tabs-expanded";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function readTool(): ToolId {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TOOL_KEY);
    if (raw === "files" || raw === "changes" || raw === "browser" || raw === "terminal") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "files";
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function writeTool(tool: ToolId): void {
  try {
    window.localStorage.setItem(ACTIVE_TOOL_KEY, tool);
  } catch {
    /* ignore */
  }
}

export interface UiState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  activeTool: ToolId;
  expandedSessionWorkspaces: Record<string, boolean>;
  chatMode: ChatMode;
  contextChips: ContextChip[];
  contextMenuOpen: boolean;
  fileMenuOpen: boolean;
  viewMenuOpen: boolean;
  helpMenuOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBoth: () => void;
  setActiveTool: (tool: ToolId) => void;
  toggleSessionWorkspace: (workspaceId: string) => void;
  setChatMode: (mode: ChatMode) => void;
  addContextChip: (chip: ContextChip) => void;
  removeContextChip: (id: string) => void;
  clearContextChips: () => void;
  setContextMenuOpen: (open: boolean) => void;
  setFileMenuOpen: (open: boolean) => void;
  setViewMenuOpen: (open: boolean) => void;
  setHelpMenuOpen: (open: boolean) => void;
  closeAllMenus: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  leftCollapsed: readFlag(LEFT_COLLAPSED_KEY, false),
  rightCollapsed: readFlag(RIGHT_COLLAPSED_KEY, false),
  activeTool: readTool(),
  expandedSessionWorkspaces: (() => {
    try {
      const raw = window.localStorage.getItem(SESSION_TABS_EXPANDED_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* ignore */
    }
    return {};
  })(),
  chatMode: "ask",
  contextChips: [],
  contextMenuOpen: false,
  fileMenuOpen: false,
  viewMenuOpen: false,
  helpMenuOpen: false,
  toggleLeft: () =>
    set((state) => {
      const next = !state.leftCollapsed;
      writeFlag(LEFT_COLLAPSED_KEY, next);
      return { leftCollapsed: next };
    }),
  toggleRight: () =>
    set((state) => {
      const next = !state.rightCollapsed;
      writeFlag(RIGHT_COLLAPSED_KEY, next);
      return { rightCollapsed: next };
    }),
  toggleBoth: () =>
    set((state) => {
      const next = !(state.leftCollapsed && state.rightCollapsed);
      writeFlag(LEFT_COLLAPSED_KEY, next);
      writeFlag(RIGHT_COLLAPSED_KEY, next);
      return { leftCollapsed: next, rightCollapsed: next };
    }),
  setActiveTool: (tool) => {
    writeTool(tool);
    set({ activeTool: tool, rightCollapsed: false });
  },
  toggleSessionWorkspace: (workspaceId) =>
    set((state) => {
      const current = state.expandedSessionWorkspaces[workspaceId] ?? true;
      const next = { ...state.expandedSessionWorkspaces, [workspaceId]: !current };
      try {
        window.localStorage.setItem(SESSION_TABS_EXPANDED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return { expandedSessionWorkspaces: next };
    }),
  setChatMode: (mode) => set({ chatMode: mode }),
  addContextChip: (chip) =>
    set((state) => {
      if (state.contextChips.some((c) => c.id === chip.id)) {
        return state;
      }
      return { contextChips: [...state.contextChips, chip] };
    }),
  removeContextChip: (id) =>
    set((state) => ({ contextChips: state.contextChips.filter((c) => c.id !== id) })),
  clearContextChips: () => set({ contextChips: [] }),
  setContextMenuOpen: (open) => set({ contextMenuOpen: open }),
  setFileMenuOpen: (open) =>
    set({
      fileMenuOpen: open,
      viewMenuOpen: false,
      helpMenuOpen: false,
      contextMenuOpen: false
    }),
  setViewMenuOpen: (open) =>
    set({
      viewMenuOpen: open,
      fileMenuOpen: false,
      helpMenuOpen: false,
      contextMenuOpen: false
    }),
  setHelpMenuOpen: (open) =>
    set({
      helpMenuOpen: open,
      fileMenuOpen: false,
      viewMenuOpen: false,
      contextMenuOpen: false
    }),
  closeAllMenus: () =>
    set({
      fileMenuOpen: false,
      viewMenuOpen: false,
      helpMenuOpen: false,
      contextMenuOpen: false
    })
}));
