// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('outline panel wiring', () => {
  const fileNavigatorShellSource = readFileSync(
    new URL('./FileNavigatorShell.tsx', import.meta.url),
    'utf8'
  );
  const fileNavigatorToolbarSource = readFileSync(
    new URL('./FileNavigatorToolbar.tsx', import.meta.url),
    'utf8'
  );
  const _fileNavigatorTreeSource = readFileSync(
    new URL('./FileNavigatorTree.tsx', import.meta.url),
    'utf8'
  );
  const editorSurfaceShellSource = readFileSync(
    new URL('./EditorSurfaceShell.tsx', import.meta.url),
    'utf8'
  );
  const changesPanelStateSource = readFileSync(
    new URL('./panels/ChangesPanel/useChangesPanelState.tsx', import.meta.url),
    'utf8'
  );
  const changesFiltersSource = readFileSync(
    new URL('./panels/ChangesPanel/useChangesFilters.ts', import.meta.url),
    'utf8'
  );
  const changesTreePanelSource = readFileSync(
    new URL('./panels/ChangesTreePanel.tsx', import.meta.url),
    'utf8'
  );
  const previewWorkspaceServiceSource = readFileSync(
    new URL('../../../../dev/previewWorkspaceService.ts', import.meta.url),
    'utf8'
  );
  const outlineTreeSource = readFileSync(
    new URL('../../features/outline/OutlineTree.tsx', import.meta.url),
    'utf8'
  );
  const fileTreeSource = readFileSync(
    new URL('../../features/file-tree/fileTree.tsx', import.meta.url),
    'utf8'
  );
  const treeNodeRowSource = readFileSync(
    new URL('../../features/file-tree/TreeNodeRow.tsx', import.meta.url),
    'utf8'
  );

  it('uses the shared outline tree in the files panel', () => {
    expect(fileNavigatorShellSource).toContain('OutlineTree');
    expect(editorSurfaceShellSource).toContain('useStickyContext');
    expect(editorSurfaceShellSource).toContain('StickyContext');
    expect(fileNavigatorToolbarSource).toContain("onSetNavigatorMode('tree')");
    expect(fileNavigatorShellSource).toContain('handleToggleAllOutlineItems');
    expect(fileNavigatorShellSource).toContain('expandedIds={expandedOutlineIds}');
  });

  it('uses the shared outline tree and outline mode in the changes panel', () => {
    expect(changesTreePanelSource).toContain('MultiWorkspaceChangesTree');
    expect(changesFiltersSource).toContain('buildOutlineFromContent(changePreview.currentContent');
    expect(changesPanelStateSource).toContain('handleRevealOutlineLine');
    expect(changesPanelStateSource).toContain('handleToggleAllOutlineItems');
  });

  it('uses the shared outline parser in preview workspace mode', () => {
    expect(previewWorkspaceServiceSource).toContain("from '../src/shared/outline'");
    expect(previewWorkspaceServiceSource).toContain('return buildOutlineFromContent(');
  });

  it('wraps both trees in a dedicated scroll container', () => {
    expect(outlineTreeSource).toContain('CustomScrollArea');
    expect(outlineTreeSource).toContain('shellClassName="adl-outline-tree-shell"');
    expect(fileTreeSource).toContain('CustomScrollArea');
    expect(fileTreeSource).toContain('shellClassName="adl-filetree-shell"');
  });

  it('uses the shared tree row chrome for outline and file trees', () => {
    expect(outlineTreeSource).toContain('TreeNodeRow');
    expect(fileTreeSource).toContain('TreeNodeRow');
    expect(treeNodeRowSource).toContain('adl-tree-node__row');
    expect(treeNodeRowSource).toContain('adl-tree-node__toggle');
  });

  it('tracks active file tree path directly from external props', () => {
    expect(fileTreeSource).toContain('const activePath = selectedFilePath;');
    expect(fileTreeSource).toContain('isActive={isSelected}');
  });
});
