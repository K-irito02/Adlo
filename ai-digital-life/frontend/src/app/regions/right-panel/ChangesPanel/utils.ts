import type { RightPanelViewProps } from '../types';
import type { CopyDict } from '../../../i18n';
import type { ChangeTreeNode } from '../changesTree';
import { type EditorView } from '@codemirror/view';
import { CodeMirrorEditorRef } from '../../../features/editor';
import type { EditorRef } from '../../../stores/types';

const CHANGES_BRANCH_STORAGE_KEY = 'adl-ui:changes-branch';

export function readSelectedBranch(initialBranch: string): string {
  try {
    return window.localStorage.getItem(CHANGES_BRANCH_STORAGE_KEY)?.trim() || initialBranch;
  } catch {
    return initialBranch;
  }
}

export function writeSelectedBranch(branch: string) {
  try {
    window.localStorage.setItem(CHANGES_BRANCH_STORAGE_KEY, branch);
  } catch {}
}

export function getChangeKindLabel(changeKind: 'added' | 'modified' | 'deleted', t: CopyDict) {
  return changeKind === 'added'
    ? t.gitAdded
    : changeKind === 'deleted'
      ? t.gitDeleted
      : t.gitModified;
}

export function getChangeStatusLabel(
  status: NonNullable<RightPanelViewProps['changePreview']>['status'],
  t: CopyDict
) {
  if (status === 'staged') {
    return t.changesStaged;
  }
  if (status === 'untracked') {
    return t.changesUntracked;
  }
  if (status === 'conflicted') {
    return t.changesConflicts;
  }
  return t.changesModified;
}

export function getPrimaryBadge(node: ChangeTreeNode): { label: string; tone: string } | undefined {
  if (node.patchSummary) {
    if (node.patchSummary.changeKind === 'added') {
      return { label: 'A', tone: 'added' };
    }
    if (node.patchSummary.changeKind === 'deleted') {
      return { label: 'D', tone: 'deleted' };
    }
    return { label: 'M', tone: 'modified' };
  }
  if (node.primaryState === 'conflicted') {
    return { label: 'C', tone: 'conflicted' };
  }
  if (node.primaryState === 'untracked') {
    return { label: 'U', tone: 'untracked' };
  }
  if (node.primaryState === 'staged') {
    return { label: 'S', tone: 'staged' };
  }
  if (node.primaryState === 'modified') {
    return { label: 'M', tone: 'modified' };
  }
  return undefined;
}

export function getEditorView(editorRef: EditorRef | null): EditorView | null {
  if (!editorRef) {
    return null;
  }
  if (editorRef instanceof CodeMirrorEditorRef) {
    return editorRef.getView();
  }
  return null;
}
