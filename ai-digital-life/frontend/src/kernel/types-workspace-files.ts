import type { PatchSet } from './types-patch';
import type { CommandExecutionResult } from './types-command';

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
