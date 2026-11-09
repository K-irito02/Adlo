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
   * 文件顶层没有目录的松散书签归入 `looseFolderName` 指定的自建目录顶层文件夹。
   * `looseFolderName` 必传：由调用方传 i18n 字典的 `bookmarkImportRootFolderName`。
   */
  | { kind: 'self-root'; looseFolderName: string }
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

/** 收集指定根目录及其全部后代目录中已有书签的 (url, title) 判重键。 */
function collectSubtreeKeys(folders: BookmarkFolder[], roots: BookmarkFolder[]): Set<string> {
  const byParent = new Map<string | undefined, BookmarkFolder[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId ?? '';
    const list = byParent.get(parentKey) ?? [];
    list.push(folder);
    byParent.set(parentKey, list);
  }
  const keys = new Set<string>();
  const descend = (folder: BookmarkFolder) => {
    for (const entry of folder.entries ?? []) {
      keys.add(tupleKey(entry.url, entry.title));
    }
    for (const child of byParent.get(folder.id) ?? []) {
      descend(child);
    }
  };
  for (const root of roots) {
    descend(root);
  }
  return keys;
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
       * 空子树（其内全部书签被重复项跳过）不落位、不计数；
       * 同名同父的已有目录复用而非新建，避免重复导入留下空同名目录。
       */
      const placeNodes = (
        list: TransferNode[],
        opts: {
          existingKeys: Set<string>;
          pushEntry: (entry: BookmarkEntry) => void;
          createChildFolder: (name: string) => {
            folder: BookmarkFolder;
            pushFolder: (folder: BookmarkFolder) => void;
            /** true = 本次新建；false = 复用已有同名目录（不重复写回、不计数） */
            created: boolean;
          };
          /** 上级用于汇总"本层保留了几个子目录"，驱动空子树不落位 */
          parentStats?: { kept: number };
        },
      ) => {
        for (const node of list) {
          if (node.kind === 'folder') {
            const { folder, pushFolder, created } = opts.createChildFolder(node.folder.name);
            // 子树判重范围 = 目标树整体（继承上级判重键）+ 本目录已有条目
            const childKeys = new Set(opts.existingKeys);
            for (const entry of folder.entries ?? []) {
              childKeys.add(tupleKey(entry.url, entry.title));
            }
            const childStats = { kept: 0 };
            // 子层要绑定"当前父目录"的判重与回写，每层各自构造
            const childCreate = (name: string) => {
              const existing = nextFolders.find(
                (f) =>
                  f.name === name &&
                  f.parentId === folder.id &&
                  (!f.parentType || f.parentType === 'folder'),
              );
              if (existing) {
                return { folder: existing, pushFolder: () => {}, created: false as const };
              }
              const child: BookmarkFolder = {
                id: createUiId('bookmark-folder'),
                name,
                createdAt: now,
                isUserCreated: true,
                parentId: folder.id,
                parentType: 'folder',
              };
              return {
                folder: child,
                pushFolder: (f: BookmarkFolder) => nextFolders.push(f),
                created: true as const,
              };
            };
            placeNodes(node.folder.children, {
              existingKeys: childKeys,
              pushEntry: (entry) => {
                folder.entries = [...(folder.entries ?? []), entry];
              },
              createChildFolder: childCreate,
              parentStats: childStats,
            });
            const hasContent = (folder.entries?.length ?? 0) > 0 || childStats.kept > 0;
            const keep = !created || hasContent;
            if (keep) {
              if (created) {
                result.importedFolders += 1;
              }
              if (opts.parentStats) {
                opts.parentStats.kept += 1;
              }
              // 新建空子树不写回——重复导入不产生空同名目录
              pushFolder(folder);
            }
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
            const existing = nextFolders.find(
              (f) =>
                f.name === name &&
                f.parentId === rootFolder.id &&
                (!f.parentType || f.parentType === 'folder'),
            );
            if (existing) {
              return { folder: existing, pushFolder: () => {}, created: false as const };
            }
            const child: BookmarkFolder = {
              id: createUiId('bookmark-folder'),
              name,
              createdAt: now,
              isUserCreated: true,
              parentId: rootFolder.id,
              parentType: 'folder',
            };
            return {
              folder: child,
              pushFolder: (f: BookmarkFolder) => nextFolders.push(f),
              created: true as const,
            };
          },
        });
        nextFolders.push(rootFolder);
      } else if (target.kind === 'folder') {
        const targetIndex = nextFolders.findIndex((f) => f.id === target.id);
        if (targetIndex >= 0) {
          const targetFolder = nextFolders[targetIndex];
          const entries = [...(targetFolder.entries ?? [])];
          nextFolders[targetIndex] = { ...targetFolder, entries };
          // 判重范围 = 目标目录整棵子树（含嵌套后代）
          const existingKeys = collectSubtreeKeys(state.browserBookmarkFolders, [targetFolder]);
          const live = { ...targetFolder, entries };
          placeNodes(nodes, {
            existingKeys,
            pushEntry: (entry) => live.entries.push(entry),
            createChildFolder: (name) => {
              const existing = nextFolders.find(
                (f) =>
                  f.name === name &&
                  f.parentId === targetFolder.id &&
                  (!f.parentType || f.parentType === 'folder'),
              );
              if (existing) {
                return { folder: existing, pushFolder: () => {}, created: false as const };
              }
              const child: BookmarkFolder = {
                id: createUiId('bookmark-folder'),
                name,
                createdAt: now,
                isUserCreated: true,
                parentId: targetFolder.id,
                parentType: 'folder',
              };
              return {
                folder: child,
                pushFolder: (f: BookmarkFolder) => nextFolders.push(f),
                created: true as const,
              };
            },
          });
          nextFolders[targetIndex] = live;
        }
      } else if (target.kind === 'self-root') {
        // 原目录结构：文件顶层目录 → 自建目录顶层用户文件夹（同名已有则合并）；
        // 顶层松散书签（如有）→ 归入 `looseFolderName`（由调用方传入 i18n 字典的展示文案）
        // 判重范围 = 自建目录整体；每次导入前按当前 nextFolders（含本次已写入条目）重新收集，避免同批次跨根漏判
        const importRoot = (rootName: string, list: TransferNode[]) => {
          const seed = collectSubtreeKeys(
            nextFolders,
            nextFolders.filter((f) => !f.parentId),
          );
          let rootFolder = nextFolders.find((f) => f.name === rootName && !f.parentId);
          const creating = !rootFolder;
          if (!rootFolder) {
            rootFolder = {
              id: createUiId('bookmark-folder'),
              name: rootName,
              createdAt: now,
              isUserCreated: true,
              entries: [],
            };
            nextFolders.push(rootFolder);
          }
          const entries = [...(rootFolder!.entries ?? [])];
          const idx = nextFolders.findIndex((f) => f.id === rootFolder!.id);
          nextFolders[idx] = { ...nextFolders[idx], entries };
          const live = nextFolders[idx];
          placeNodes(list, {
            existingKeys: seed,
            pushEntry: (entry) => live.entries!.push(entry),
            createChildFolder: (name) => {
              const existing = nextFolders.find(
                (f) =>
                  f.name === name &&
                  f.parentId === rootFolder!.id &&
                  (!f.parentType || f.parentType === 'folder'),
              );
              if (existing) {
                return { folder: existing, pushFolder: () => {}, created: false as const };
              }
              const child: BookmarkFolder = {
                id: createUiId('bookmark-folder'),
                name,
                createdAt: now,
                isUserCreated: true,
                parentId: rootFolder!.id,
                parentType: 'folder',
              };
              return {
                folder: child,
                pushFolder: (f: BookmarkFolder) => nextFolders.push(f),
                created: true as const,
              };
            },
          });
          // 根级目录与子目录同口径：全重复被跳过且无子目录落位 → 不落位、不计数
          const hasContent =
            (live.entries?.length ?? 0) > 0 || nextFolders.some((f) => f.parentId === live.id);
          if (creating) {
            if (hasContent) {
              result.importedFolders += 1;
            } else {
              const dropIndex = nextFolders.findIndex((f) => f.id === live.id);
              if (dropIndex >= 0) {
                nextFolders.splice(dropIndex, 1);
              }
            }
          }
        };
        const rootFolders = nodes.filter((n) => n.kind === 'folder');
        const looseBookmarks = nodes.filter((n) => n.kind === 'bookmark');
        for (const root of rootFolders) {
          if (root.kind === 'folder') {
            importRoot(root.folder.name, root.folder.children);
          }
        }
        if (looseBookmarks.length > 0) {
          const looseName = target.looseFolderName.trim();
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
              const existing = nextFolders.find(
                (f) =>
                  f.name === childName &&
                  f.parentId === child.id &&
                  (!f.parentType || f.parentType === 'folder'),
              );
              if (existing) {
                return { folder: existing, pushFolder: () => {}, created: false as const };
              }
              const grandchild: BookmarkFolder = {
                id: createUiId('bookmark-folder'),
                name: childName,
                createdAt: now,
                isUserCreated: true,
                parentId: child.id,
                parentType: 'folder',
              };
              return {
                folder: grandchild,
                pushFolder: (f: BookmarkFolder) => nextFolders.push(f),
                created: true as const,
              };
            },
          });
          nextFolders.push(child);
        }
      } else {
        const wsId = target.id;
        const entries = [...(nextWorkspaceBookmarks[wsId] ?? [])];
        // 判重范围 = ws 平铺书签 + ws 子树（含嵌套子目录）
        const wsChildFolders = state.browserBookmarkFolders.filter(
          (f) => f.parentId === wsId && f.parentType === 'workspace',
        );
        const existingKeys = new Set([
          ...entries.map((e) => tupleKey(e.url, e.title)),
          ...collectSubtreeKeys(state.browserBookmarkFolders, wsChildFolders),
        ]);
        placeNodes(nodes, {
          existingKeys,
          pushEntry: (entry) => entries.push(entry),
          createChildFolder: (name) => {
            const existing = nextFolders.find(
              (f) => f.name === name && f.parentId === wsId && f.parentType === 'workspace',
            );
            if (existing) {
              return { folder: existing, pushFolder: () => {}, created: false as const };
            }
            const child: BookmarkFolder = {
              id: createUiId('bookmark-folder'),
              name,
              createdAt: now,
              isUserCreated: true,
              parentId: wsId,
              parentType: 'workspace',
            };
            return {
              folder: child,
              pushFolder: (f: BookmarkFolder) => nextFolders.push(f),
              created: true as const,
            };
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
