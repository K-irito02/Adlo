import React from 'react';
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconCircle,
  IconFolder,
  IconUpload,
} from '../../icons';
import type { CopyDict } from '../../i18n';
import type { GitSnapshot, ModelProviderId } from '@ai-digital-life/kernel';
import { MODEL_OPTIONS } from '../../utils/constants';

export type GitStatus = 'synced' | 'dirty' | 'unpushed' | 'conflict' | 'no-repo';

export function modelLabel(providerId: ModelProviderId, modelId?: string): string {
  if (!modelId) return '—';
  const option = (MODEL_OPTIONS[providerId] ?? []).find((candidate) => candidate.id === modelId);
  return option?.label ?? modelId;
}

export function gitIcon(status: GitStatus, size: 12 | 14 | 16 = 12) {
  switch (status) {
    case 'synced':
      return <IconCheckCircle size={size} decorative />;
    case 'dirty':
      return <IconCircle size={size} decorative />;
    case 'unpushed':
      return <IconUpload size={size} decorative />;
    case 'conflict':
      return <IconAlertTriangle size={size} decorative />;
    default:
      return <IconFolder size={size} decorative />;
  }
}

export function gitStatusLabel(t: CopyDict, status: GitStatus): string {
  switch (status) {
    case 'synced':
      return t.statusbarGitSynced;
    case 'dirty':
      return t.statusbarGitDirty;
    case 'unpushed':
      return t.statusbarGitUnpushed;
    case 'conflict':
      return t.statusbarGitConflict;
    default:
      return t.statusbarGitNoRepo;
  }
}

export function modelHealthLabel(t: CopyDict, healthy?: boolean): string {
  return healthy ? t.statusHealthy : t.statusDegraded;
}

export function modelHealthTone(healthy?: boolean): 'healthy' | 'degraded' {
  return healthy ? 'healthy' : 'degraded';
}

export function isDirtyWorktree(snapshot?: GitSnapshot): boolean {
  return Boolean(
    snapshot &&
    (snapshot.staged.length > 0 || snapshot.unstaged.length > 0 || snapshot.untracked.length > 0)
  );
}
