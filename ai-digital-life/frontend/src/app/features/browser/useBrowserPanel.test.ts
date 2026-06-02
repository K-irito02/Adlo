import { describe, expect, it } from "vitest";
import { computeNavigatorCount } from "./useBrowserPanel";

function makeTab(id: string) {
  return { id, title: id, url: `https://${id}.example`, workspaceId: "ws-1", isPinned: false, sortOrder: 0 };
}

function makeBookmark(url: string) {
  return { title: url, url };
}

function makeHistoryEntry(id: string) {
  return { id, title: id, url: `https://${id}.example`, visitedAt: Date.now() };
}

function makeSearchResult(url: string) {
  return { title: url, url, source: "saved" };
}

describe("computeNavigatorCount (mode-aware header count)", () => {
  it("tabs mode: returns browserTabs.length (open URL tabs only)", () => {
    const tabs = [makeTab("t1"), makeTab("t2"), makeTab("t3")];
    expect(
      computeNavigatorCount("tabs", "", tabs, [], [], [], [], []),
    ).toBe(3);
  });

  it("tabs mode with 0 open tabs returns 0 (consistent with 'Open Tabs' label)", () => {
    expect(
      computeNavigatorCount("tabs", "", [], [], [], [], [], []),
    ).toBe(0);
  });

  it("bookmarks mode (no query): returns browserBookmarks.length", () => {
    const bookmarks = [makeBookmark("a"), makeBookmark("b")];
    expect(
      computeNavigatorCount("bookmarks", "", [], bookmarks, [], [], [], []),
    ).toBe(2);
  });

  it("bookmarks mode (with query): returns filteredBookmarks.length", () => {
    const bookmarks = [makeBookmark("a"), makeBookmark("b"), makeBookmark("c")];
    const filtered = [makeBookmark("a")];
    expect(
      computeNavigatorCount("bookmarks", "a", [], bookmarks, [], [], filtered, []),
    ).toBe(1);
  });

  it("history mode (no query): returns browserHistory.length", () => {
    const history = [makeHistoryEntry("h1"), makeHistoryEntry("h2")];
    expect(
      computeNavigatorCount("history", "", [], [], history, [], [], []),
    ).toBe(2);
  });

  it("history mode (with query): returns filteredHistory.length", () => {
    const history = [makeHistoryEntry("h1"), makeHistoryEntry("h2")];
    const filtered = [makeHistoryEntry("h1")];
    expect(
      computeNavigatorCount("history", "h", [], [], history, [], [], filtered),
    ).toBe(1);
  });

  it("search mode: returns searchResults.length", () => {
    const results = [makeSearchResult("a"), makeSearchResult("b")];
    expect(
      computeNavigatorCount("search", "", [], [], [], results, [], []),
    ).toBe(2);
  });

  it("search mode with empty results returns 0 (no fallback to bookmarks/history)", () => {
    expect(
      computeNavigatorCount("search", "query", [], [makeBookmark("a")], [makeHistoryEntry("h1")], [], [], []),
    ).toBe(0);
  });
});

describe("semantic consistency: title vs count per mode", () => {
  it("tabs mode: title='Open Tabs' matches count=browserTabs.length", () => {
    const tabs = [makeTab("t1"), makeTab("t2")];
    const count = computeNavigatorCount("tabs", "", tabs, [], [], [], [], []);
    expect(count).toBe(2);
  });

  it("bookmarks mode: title='Saved tabs' matches count=bookmarks.length", () => {
    const bookmarks = [makeBookmark("a"), makeBookmark("b"), makeBookmark("c")];
    const count = computeNavigatorCount("bookmarks", "", [], bookmarks, [], [], [], []);
    expect(count).toBe(3);
  });

  it("history mode: title='History tabs' matches count=history.length", () => {
    const history = [makeHistoryEntry("h1")];
    const count = computeNavigatorCount("history", "", [], [], history, [], [], []);
    expect(count).toBe(1);
  });
});
