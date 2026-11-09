import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import type { BookmarkEntry, BookmarkFolder } from './browserTypes';
import type { TransferNode } from '@features/bookmarks/bookmarkTransferTypes';

export type BookmarkImportTarget =
  | { kind: 'new-folder'; name: string }
  | { kind: 'folder'; id: string }
  | { kind: 'workspace'; id: string };

export interface BookmarkImportResult {
  importedBookmarks: number;
  importedFolders: number;
  /** 因重复而跳过的条目数（仅 `skip` 策略下可能非 0） */
  skipped: number;
}

/** 菜单直接打开文件选择器选完文件后暂存的解析结果；导入对话框挂载时消费并清空。 */
export interface BookmarkImportDraft {
  fileName: string;
  nodes: TransferNode[];
  invalidCount: number;
}

export interface BookmarkTransferSlice {
  /** 当前打开的书签搬运对话框；`null` 表示关闭。 */
  bookmarkTransferDialog: 'export' | 'import' | null;
  setBookmarkTransferDialog: (value: 'export' | 'import' | null) => void;
  bookmarkImportDraft: BookmarkImportDraft | null;
  setBookmarkImportDraft: (draft: BookmarkImportDraft | null) => void;
  browserImportBookmarks: (input: {
    nodes: TransferNode[];
    target: BookmarkImportTarget;
    duplicatePolicy: 'skip' | 'allow';
  }) => BookmarkImportResult;
}

function makeEntry(node: Extract<TransferNode, { kind: 'bookmark' }>): BookmarkEntry {
  return {
    id: createUiId('bookmark'),
    url: node.url,
    title: node.title,
    addedAt: node.addedAt,
    lastModifiedAt: node.lastModifiedAt,
    ...(node.icon ? { iconUri: node.icon } : {}),
  };
}

function tupleKey(url: string, title: string): string {
  return JSON.stringify([url, title]);
}

export const createBookmarkTransferSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BookmarkTransferSlice => ({
  bookmarkTransferDialog: null,
  setBookmarkTransferDialog: (value) => {
    set({ bookmarkTransferDialog: value });
  },
  bookmarkImportDraft: null,
  setBookmarkImportDraft: (draft) => {
    set({ bookmarkImportDraft: draft });
  },
  browserImportBookmarks: ({ nodes, target, duplicatePolicy }) => {
    const result: BookmarkImportResult = {
      importedBookmarks: 0,
      importedFolders: 0,
      skipped: 0,
    };

    set((state) => {
      const now = Date.now();
      const nextFolders = [...state.browserBookmarkFolders];
      const nextWorkspaceBookmarks = { ...state.browserWorkspaceBookmarks };
      const addedEntries: BookmarkEntry[] = [];

      const addIndex = (entry: BookmarkEntry) => {
        addedEntries.push(entry);
      };

      /**
       * 把一层节点写进目标容器。
       * `container` 用于判重；`makeFolder` 负责在当前层创建子目录。
       */
      const placeNodes = (
        list: TransferNode[],
        opts: {
          existingKeys: Set<string>;
          pushEntry: (entry: BookmarkEntry) => void;
          createChildFolder: (name: string) => {
            folder: BookmarkFolder;
            pushFolder: (folder: BookmarkFolder) => void;
          };
        },
      ) => {
        for (const node of list) {
          if (node.kind === 'folder') {
            const { folder, pushFolder } = opts.createChildFolder(node.folder.name);
            result.importedFolders += 1;
            const childKeys = new Set<string>();
            placeNodes(node.folder.children, {
              existingKeys: childKeys,
              pushEntry: (entry) => {
                folder.entries = [...(folder.entries ?? []), entry];
              },
              createChildFolder: (name) => {
                const child: BookmarkFolder = {
                  id: createUiId('bookmark-folder'),
                  name,
                  createdAt: now,
                  isUserCreated: true,
                  parentId: folder.id,
                  parentType: 'folder',
                };
                pushFolder(child);
                return {
                  folder: child,
                  pushFolder: (f) => {
                    nextFolders.push(f);
                  },
                };
              },
            });
            pushFolder(folder);
            continue;
          }

          const key = tupleKey(node.url, node.title);
          if (duplicatePolicy === 'skip' && opts.existingKeys.has(key)) {
            result.skipped += 1;
            continue;
          }
          opts.existingKeys.add(key);
          const entry = makeEntry(node);
          opts.pushEntry(entry);
          addIndex(entry);
          result.importedBookmarks += 1;
        }
      };

      if (target.kind === 'new-folder') {
        const rootFolder: BookmarkFolder = {
          id: createUiId('bookmark-folder'),
          name: target.name.trim(),
          createdAt: now,
          isUserCreated: true,
          entries: [],
        };
        result.importedFolders += 1;
        const rootKeys = new Set<string>();
        placeNodes(nodes, {
          existingKeys: rootKeys,
          pushEntry: (entry) => {
            rootFolder.entries = [...(rootFolder.entries ?? []), entry];
          },
          createChildFolder: (name) => {
            const child: BookmarkFolder = {
              id: createUiId('bookmark-folder'),
              name,
              createdAt: now,
              isUserCreated: true,
              parentId: rootFolder.id,
              parentType: 'folder',
            };
            return { folder: child, pushFolder: (f) => nextFolders.push(f) };
          },
        });
        nextFolders.push(rootFolder);
      } else if (target.kind === 'folder') {
        const targetIndex = nextFolders.findIndex((f) => f.id === target.id);
        if (targetIndex >= 0) {
          const targetFolder = nextFolders[targetIndex];
          const entries = [...(targetFolder.entries ?? [])];
          nextFolders[targetIndex] = { ...targetFolder, entries };
          const existingKeys = new Set(entries.map((e) => tupleKey(e.url, e.title)));
          const live = { ...targetFolder, entries };
          placeNodes(nodes, {
            existingKeys,
            pushEntry: (entry) => live.entries.push(entry),
            createChildFolder: (name) => {
              const child: BookmarkFolder = {
                id: createUiId('bookmark-folder'),
                name,
                createdAt: now,
                isUserCreated: true,
                parentId: targetFolder.id,
                parentType: 'folder',
              };
              return { folder: child, pushFolder: (f) => nextFolders.push(f) };
            },
          });
          nextFolders[targetIndex] = live;
        }
      } else {
        const wsId = target.id;
        const entries = [...(nextWorkspaceBookmarks[wsId] ?? [])];
        const existingKeys = new Set(entries.map((e) => tupleKey(e.url, e.title)));
        placeNodes(nodes, {
          existingKeys,
          pushEntry: (entry) => entries.push(entry),
          createChildFolder: (name) => {
            const child: BookmarkFolder = {
              id: createUiId('bookmark-folder'),
              name,
              createdAt: now,
              isUserCreated: true,
              parentId: wsId,
              parentType: 'workspace',
            };
            return { folder: child, pushFolder: (f) => nextFolders.push(f) };
          },
        });
        if (entries.length > 0) {
          nextWorkspaceBookmarks[wsId] = entries;
        }
      }

      const nextBookmarks = [...state.browserBookmarks];
      for (const entry of addedEntries) {
        if (!nextBookmarks.some((b) => b.url === entry.url && b.title === entry.title)) {
          nextBookmarks.push({ url: entry.url, title: entry.title });
        }
      }

      persist('adl:browser.bookmarkFolders', nextFolders);
      persist('adl:browser.workspaceBookmarks', nextWorkspaceBookmarks);
      persist('adl:browser.bookmarks', nextBookmarks);

      return {
        browserBookmarkFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserBookmarks: nextBookmarks,
      };
    });

    return result;
  },
});
