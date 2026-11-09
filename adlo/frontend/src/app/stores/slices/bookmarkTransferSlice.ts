import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import type { BookmarkEntry, BookmarkFolder } from './browserTypes';
import type { TransferNode } from '@features/bookmarks/bookmarkTransferTypes';

export type BookmarkImportTarget =
  | { kind: 'new-folder'; name: string }
  | { kind: 'folder'; id: string }
  | { kind: 'workspace'; id: string }
  /**
   * 原目录结构：文件顶层的目录按原样创建为自建目录顶层用户文件夹（同名已存在则合并）；
   * 文件顶层没有目录的松散书签归入 `looseFolderName` 指定的自建目录顶层文件夹（缺省「顶层书签」）。
   */
  | { kind: 'self-root'; looseFolderName?: string }
  /** 在指定父目录（工作区或用户目录）下先新建嵌套目录再以之为导入目标。 */
  | { kind: 'child-folder'; parentId: string; parentType: 'folder' | 'workspace'; name: string };

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
      } else if (target.kind === 'self-root') {
        // 原目录结构：文件顶层目录 → 自建目录顶层用户文件夹（同名已有则合并）；
        // 顶层松散书签（如有）→ 归入 `looseFolderName` 指定的顶层用户文件夹（缺省「顶层书签」）。
        const importRoot = (rootName: string, list: TransferNode[]) => {
          let rootFolder = nextFolders.find((f) => f.name === rootName && !f.parentId);
          if (!rootFolder) {
            rootFolder = {
              id: createUiId('bookmark-folder'),
              name: rootName,
              createdAt: now,
              isUserCreated: true,
              entries: [],
            };
            result.importedFolders += 1;
            nextFolders.push(rootFolder);
          }
          const entries = [...(rootFolder.entries ?? [])];
          const idx = nextFolders.findIndex((f) => f.id === rootFolder!.id);
          nextFolders[idx] = { ...nextFolders[idx], entries };
          const live = nextFolders[idx];
          const existingKeys = new Set(entries.map((e) => tupleKey(e.url, e.title)));
          placeNodes(list, {
            existingKeys,
            pushEntry: (entry) => live.entries!.push(entry),
            createChildFolder: (name) => {
              const child: BookmarkFolder = {
                id: createUiId('bookmark-folder'),
                name,
                createdAt: now,
                isUserCreated: true,
                parentId: rootFolder!.id,
                parentType: 'folder',
              };
              return { folder: child, pushFolder: (f) => nextFolders.push(f) };
            },
          });
        };
        const rootFolders = nodes.filter((n) => n.kind === 'folder');
        const looseBookmarks = nodes.filter((n) => n.kind === 'bookmark');
        for (const root of rootFolders) {
          if (root.kind === 'folder') {
            importRoot(root.folder.name, root.folder.children);
          }
        }
        if (looseBookmarks.length > 0) {
          const looseName = (target.looseFolderName ?? '').trim() || '顶层书签';
          importRoot(looseName, looseBookmarks);
        }
      } else if (target.kind === 'child-folder') {
        // 在指定父目录（用户目录或工作区根）下新建嵌套目录并以之为导入目标
        const name = target.name.trim();
        if (name) {
          const child: BookmarkFolder = {
            id: createUiId('bookmark-folder'),
            name,
            createdAt: now,
            isUserCreated: true,
            parentId: target.parentId,
            parentType: target.parentType,
            entries: [],
          };
          result.importedFolders += 1;
          const rootKeys = new Set<string>();
          placeNodes(nodes, {
            existingKeys: rootKeys,
            pushEntry: (entry) => {
              child.entries = [...(child.entries ?? []), entry];
            },
            createChildFolder: (childName) => {
              const grandchild: BookmarkFolder = {
                id: createUiId('bookmark-folder'),
                name: childName,
                createdAt: now,
                isUserCreated: true,
                parentId: child.id,
                parentType: 'folder',
              };
              return { folder: grandchild, pushFolder: (f) => nextFolders.push(f) };
            },
          });
          nextFolders.push(child);
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
