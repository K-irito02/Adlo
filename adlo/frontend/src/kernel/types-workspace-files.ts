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
 * 缺省 `{ offset: 0, limit: 200 }`；`limit` 由后端钳制到硬上限
 * （常量定义在前端单一来源 `shared/ipc/searchWindow.ts`，与本接口保持同步）。
 */
export interface WorkspaceSearchWindow {
  offset?: number;
  limit?: number;
}

/**
 * 检索过滤器：手动忽略名单与 `.gitignore` 开关（检索设置弹窗写入，store 持有）。
 * 两者为并集关系——命中任一即跳过该文件；`limit`/分页语义在过滤之后生效，
 * 因此"加载更多/显示全部"的计数不受影响。
 */
export interface WorkspaceSearchFilter {
  /** 工作区相对路径数组：文件或目录（目录隐含其全部后代） */
  excludedPaths?: string[];
  /** 是否叠加工作区 `.gitignore` 链（类 git 语义自动合并，深层覆盖浅层） */
  useGitignore?: boolean;
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

/**
 * 二进制/媒体文件文档（与 Rust `WorkspaceMediaDocument` 逐字段对齐，
 * `#[serde(rename_all = "camelCase")]`）。
 * 字节以 base64 承载，前端解码为 Blob 后经 object URL 交给原生标签/第三方预览库渲染。
 */
export interface WorkspaceMediaDocument {
  path: string;
  mime: string;
  base64: string;
  size: number;
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

/**
 * POST `/workspace/tree` 的响应载荷：树 + 是否来自缓存行 + 行捕获时间。
 * 与 Rust `TreePayload`（`#[serde(rename_all = "camelCase")]`）逐字段对齐；
 * `capturedAt` 供校准门判定行龄，miss/force 时为本次扫描时间。
 */
export interface WorkspaceTreePayload {
  tree: WorkspaceTreeNode[];
  fromCache: boolean;
  capturedAt: number;
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
