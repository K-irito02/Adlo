import type { PatchSet } from './types-patch';
import type { CommandExecutionResult } from './types-legacy';

// ════════════════════════════════════════════════════════
// Validation / Diagnostics
// ════════════════════════════════════════════════════════

export interface DiagnosticSummary {
  id: string;
  source: 'typescript' | 'vite' | 'eslint' | 'vitest' | 'jest' | 'system';
  severity: 'info' | 'warning' | 'error';
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  id: string;
  workspaceId: string;
  runId?: string;
  patchSetId?: string;
  status: 'passed' | 'failed' | 'skipped';
  summary: string;
  diagnostics: DiagnosticSummary[];
  createdAt: number;
}

export interface PatchApplicationResult {
  patchSet: PatchSet;
  repairPatchSet?: PatchSet;
  validation?: ValidationResult;
  commandResult?: CommandExecutionResult;
  rolledBack: boolean;
}

// ════════════════════════════════════════════════════════
// Workspace File Operations
// ════════════════════════════════════════════════════════

export interface WorkspaceSearchHit {
  path: string;
  line: number;
  preview: string;
}

/**
 * 检索分页窗口：跳过前 `offset` 条命中，最多返回 `limit` 条。
 * 缺省 `{ offset: 0, limit: SEARCH_PAGE_SIZE }`；`limit` 由后端钳制到安全阀
 * （[`SEARCH_MAX_RESULTS`]），调用方无法通过超大 `limit` 绕过。
 */
export interface WorkspaceSearchWindow {
  offset?: number;
  limit?: number;
}

/**
 * 检索结果页。`hasMore` 表示**窗口之后仍有命中**（后端多探一条得出），
 * 因此可以精确区分"已取尽"与"还有更多"，而不是靠"等于上限即视为被截断"来保守推断。
 */
export interface WorkspaceSearchPage {
  hits: WorkspaceSearchHit[];
  hasMore: boolean;
}

export interface WorkspaceFilesChangedBatch {
  /** 变更（新增/修改）文件的工作区相对路径 */
  changed: string[];
  /** 删除文件的工作区相对路径 */
  removed: string[];
  /** 单批超限：消费端应退化为整轮重搜 */
  overflow?: boolean;
}

export interface WorkspaceFileDocument {
  path: string;
  content: string;
  lastModifiedAt: number;
}

export type WorkspaceChangeKind = 'added' | 'modified' | 'deleted';
export type WorkspaceChangeStatus = 'staged' | 'modified' | 'untracked' | 'conflicted';

export interface WorkspaceChangePreview {
  path: string;
  changeKind: WorkspaceChangeKind;
  status: WorkspaceChangeStatus;
  baseExists: boolean;
  currentExists: boolean;
  baseContent: string;
  currentContent: string;
}

export interface WorkspaceFileChangedEvent {
  path: string;
  lastModifiedAt: number;
}

export interface WorkspaceTreeNode {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  children: WorkspaceTreeNode[];
}

export interface FileOutlineItem {
  id: string;
  label: string;
  kind:
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'const'
    | 'heading'
    | 'variable'
    | 'method'
    | 'property'
    | 'enum'
    | 'enum-member';
  line: number;
  endLine?: number;
  depth?: number;
  icon?: string;
  children?: FileOutlineItem[];
}
