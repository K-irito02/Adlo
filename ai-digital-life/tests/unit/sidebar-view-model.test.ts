import { describe, expect, it } from "vitest";
import type { AppInfo, ConversationSessionRecord, RecentWorkspaceEntry } from "@ai-digital-life/kernel";
import { buildSidebarViewModel, getVisibleSidebarSessions, SIDEBAR_SESSION_PREVIEW_LIMIT } from "../../apps/desktop/renderer/src/app/sidebarViewModel";

const now = 1_700_000_000_000;

function workspace(id: string, name = id): RecentWorkspaceEntry {
  return {
    id,
    path: `E:/${name}`,
    rootPath: `E:/${name}`,
    name,
    lastOpenedAt: now,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true
  };
}

function appInfo(currentWorkspaceId = "workspace-1"): AppInfo {
  return {
    appName: "AI Digital Life",
    version: "0.1.0",
    config: {
      language: "en-US",
      themeMode: "light",
      resolvedTheme: "light",
      logLevel: "info",
      maxRecentWorkspaces: 10,
      modelPreferences: { providers: {} }
    },
    currentWorkspace: {
      id: currentWorkspaceId,
      path: "E:/repo",
      rootPath: "E:/repo",
      name: "repo",
      type: "node",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    },
    recentLogs: []
  };
}

function session(id: string, workspaceId = "workspace-1", index = 0): ConversationSessionRecord {
  return {
    id,
    workspaceId,
    title: `Session ${index}`,
    status: "active",
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: index,
    manualUnread: false,
    lastReadAt: now,
    archivedAt: undefined,
    titleUpdatedAt: now,
    createdAt: now + index,
    updatedAt: now + index,
    lastMessageAt: now + index
  };
}

describe("sidebar view model", () => {
  it("keeps project sessions under their workspace and exposes only five until expanded", () => {
    const model = buildSidebarViewModel({
      appInfo: appInfo(),
      recentWorkspaces: [workspace("workspace-1", "repo")],
      sessions: Array.from({ length: 7 }, (_, index) => session(`session-${index + 1}`, "workspace-1", index))
    });

    const projectSessions = getVisibleSidebarSessions(model.workspaces[0].sessions, false);

    expect(model.workspaces).toHaveLength(1);
    expect(projectSessions.items.map((item) => item.session.id)).toEqual([
      "session-1",
      "session-2",
      "session-3",
      "session-4",
      "session-5"
    ]);
    expect(projectSessions.hiddenCount).toBe(2);
    expect(projectSessions.limit).toBe(SIDEBAR_SESSION_PREVIEW_LIMIT);
    expect(getVisibleSidebarSessions(model.workspaces[0].sessions, true).items).toHaveLength(7);
  });

  it("separates standalone conversations from project workspace sessions", () => {
    const model = buildSidebarViewModel({
      appInfo: appInfo(),
      recentWorkspaces: [workspace("workspace-1", "repo"), workspace("workspace-2", "other")],
      sessions: [
        session("project-session", "workspace-1", 0),
        session("standalone-session", "conversation-only", 1)
      ]
    });

    expect(model.workspaces[0].sessions.map((item) => item.session.id)).toEqual(["project-session"]);
    expect(model.standaloneSessions.map((item) => item.session.id)).toEqual(["standalone-session"]);
  });
});
