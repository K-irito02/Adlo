// ════════════════════════════════════════════════════════
// Patch Types
// ════════════════════════════════════════════════════════

export type PatchHunkDecision = 'pending' | 'accepted' | 'rejected';
export type PatchSetStatus = 'draft' | 'ready' | 'applying' | 'applied' | 'failed' | 'rolled-back';

export interface PatchHunk {
  id: string;
  filePatchId: string;
  patchSetId: string;
  relativePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  preview: string;
  beforeText: string;
  afterText: string;
  decision: PatchHunkDecision;
}

export interface FilePatch {
  id: string;
  patchSetId: string;
  relativePath: string;
  language?: string;
  beforeContent: string;
  afterContent: string;
  hunks: PatchHunk[];
}

export interface PatchSet {
  id: string;
  workspaceId: string;
  sessionId: string;
  runId?: string;
  title: string;
  summary: string;
  status: PatchSetStatus;
  checkpointId?: string;
  filePatches: FilePatch[];
  createdAt: number;
  updatedAt: number;
}
