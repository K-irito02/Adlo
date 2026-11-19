import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import { childOrderKey } from '@features/file-tree/childOrder';
import type { RecentWorkspaceEntry } from '@shared/ipc';

const WS = 'workspace_a';
const WS_PATH = 'C:/ws/a';
const FILES_KEY = 'adl:files.dirExpanded';
const CHANGES_KEY = 'adl:changes.dirExpanded';

function workspaceEntry(id: string, path: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
  };
}

function stored(key: string) {
  return JSON.parse(localStorage.getItem(key) ?? 'null');
}

describe('path remap keeps memory and storage consistent', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      expandedFileTreePaths: {},
      expandedChangesTreePaths: {},
      fileChildOrder: {},
      recentWorkspaces: [],
    });
  });

  it('persists the renamed path instead of leaving the stale one on disk (files side)', () => {
    useAppStore.setState({
      expandedFileTreePaths: { [WS]: { expanded: { 'src/old': true, 'src/old/deep': true } } },
    });
    useAppStore.getState().carryExpandedPathsForRename(WS, 'src/old', 'src/new');
    expect(useAppStore.getState().expandedFileTreePaths[WS]?.expanded).toEqual({
      'src/new': true,
      'src/new/deep': true,
    });
    flushCrossSliceWrites();
    expect(stored(FILES_KEY)[WS].expanded).toEqual({
      'src/new': true,
      'src/new/deep': true,
    });
  });

  it('carries manualCollapsed along on rename (files side)', () => {
    useAppStore.setState({
      expandedFileTreePaths: {
        [WS]: { expanded: { src: true }, manualCollapsed: { 'src/old': true } },
      },
    });
    useAppStore.getState().carryExpandedPathsForRename(WS, 'src/old', 'src/new');
    expect(useAppStore.getState().expandedFileTreePaths[WS]).toEqual({
      expanded: { src: true },
      manualCollapsed: { 'src/new': true },
    });
    flushCrossSliceWrites();
    expect(stored(FILES_KEY)[WS].manualCollapsed).toEqual({ 'src/new': true });
  });

  it('drops the deleted directory and its descendants (files side)', () => {
    useAppStore.setState({
      expandedFileTreePaths: {
        [WS]: { expanded: { src: true, 'src/gone': true, 'src/gone/deep': true } },
      },
    });
    useAppStore.getState().dropExpandedPathsUnder(WS, 'src/gone');
    expect(useAppStore.getState().expandedFileTreePaths[WS]?.expanded).toEqual({ src: true });
    flushCrossSliceWrites();
    expect(stored(FILES_KEY)[WS].expanded).toEqual({ src: true });
  });

  it('persists the renamed path instead of leaving the stale one on disk (changes side)', () => {
    useAppStore.setState({
      expandedChangesTreePaths: { [WS]: { expanded: { 'src/old': true } } },
    });
    useAppStore.getState().carryChangesExpandedPathsForRename(WS, 'src/old', 'src/new');
    expect(useAppStore.getState().expandedChangesTreePaths[WS]?.expanded).toEqual({
      'src/new': true,
    });
    flushCrossSliceWrites();
    expect(stored(CHANGES_KEY)[WS].expanded).toEqual({ 'src/new': true });
  });

  it('drops the deleted directory, its descendants and their manual marks (changes side)', () => {
    useAppStore.setState({
      expandedChangesTreePaths: {
        [WS]: {
          expanded: { src: true, 'src/gone': true, 'src/gone/deep': true },
          manualCollapsed: { 'src/gone': true, other: true },
        },
      },
    });
    useAppStore.getState().dropChangesExpandedPathsUnder(WS, 'src/gone');
    expect(useAppStore.getState().expandedChangesTreePaths[WS]).toEqual({
      expanded: { src: true },
      manualCollapsed: { other: true },
    });
    flushCrossSliceWrites();
    expect(stored(CHANGES_KEY)[WS]).toEqual({
      expanded: { src: true },
      manualCollapsed: { other: true },
    });
  });

  it('carries manualCollapsed along on rename (changes side)', () => {
    useAppStore.setState({
      expandedChangesTreePaths: {
        [WS]: { expanded: { src: true }, manualCollapsed: { 'src/old': true } },
      },
    });
    useAppStore.getState().carryChangesExpandedPathsForRename(WS, 'src/old', 'src/new');
    expect(useAppStore.getState().expandedChangesTreePaths[WS]).toEqual({
      expanded: { src: true },
      manualCollapsed: { 'src/new': true },
    });
    flushCrossSliceWrites();
    expect(stored(CHANGES_KEY)[WS].manualCollapsed).toEqual({ 'src/new': true });
  });

  it('leaves storage untouched when rename matches nothing', () => {
    useAppStore.setState({
      expandedFileTreePaths: { [WS]: { expanded: { src: true } } },
    });
    useAppStore.getState().carryExpandedPathsForRename(WS, 'src/missing', 'src/new');
    flushCrossSliceWrites();
    expect(localStorage.getItem(FILES_KEY)).toBeNull();
  });

  it('carries directory child order on rename (keys + parent name)', () => {
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry(WS, WS_PATH)],
      fileChildOrder: {
        [childOrderKey(WS_PATH, '')]: ['src', 'docs'],
        [childOrderKey(WS_PATH, 'src')]: ['b.ts', 'a.ts'],
        [childOrderKey(WS_PATH, 'src/app')]: ['x.ts'],
      },
    });

    useAppStore.getState().carryExpandedPathsForRename(WS, 'src', 'lib');

    expect(useAppStore.getState().fileChildOrder).toEqual({
      [childOrderKey(WS_PATH, '')]: ['lib', 'docs'],
      [childOrderKey(WS_PATH, 'lib')]: ['b.ts', 'a.ts'],
      [childOrderKey(WS_PATH, 'lib/app')]: ['x.ts'],
    });
    flushCrossSliceWrites();
    expect(stored('adl:files.childOrder')[childOrderKey(WS_PATH, '')]).toEqual(['lib', 'docs']);
  });

  it('drops directory child order on delete', () => {
    useAppStore.setState({
      recentWorkspaces: [workspaceEntry(WS, WS_PATH)],
      fileChildOrder: {
        [childOrderKey(WS_PATH, '')]: ['src', 'docs'],
        [childOrderKey(WS_PATH, 'src')]: ['a'],
        [childOrderKey(WS_PATH, 'src/app')]: ['b'],
      },
    });

    useAppStore.getState().dropExpandedPathsUnder(WS, 'src');

    expect(useAppStore.getState().fileChildOrder).toEqual({
      [childOrderKey(WS_PATH, '')]: ['docs'],
    });
    flushCrossSliceWrites();
    expect(stored('adl:files.childOrder')[childOrderKey(WS_PATH, 'src')]).toBeUndefined();
  });
});
