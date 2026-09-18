import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SearchResultsTree } from './SearchResultsTree';

function section() {
  return {
    workspaceId: 'ws-1',
    workspaceName: 'ws',
    files: [
      {
        key: 'a/b.md',
        path: 'a/b.md',
        name: 'b.md',
        matchCount: 1,
        snippets: [],
        onOpen: () => {},
        isActive: false,
      },
    ],
  };
}

const baseProps = {
  sections: [section()],
  variant: 'tree' as const,
  query: 'q',
  matchCase: false,
  wholeWord: false,
  useRegex: false,
  scopeKey: 'content:tree',
  nameQuery: '',
  expandLabel: 'expand',
  collapseLabel: 'collapse',
  staleLabel: 'stale',
  structureSignal: null,
  onStructureSignalConsumed: () => {},
  onCollapseStatusChange: () => {},
};

describe('SearchResultsTree collapse-all (事项 45 Phase 4)', () => {
  it('collapses dirs with workspace-namespaced keys', () => {
    const onCollapseStatusChange = vi.fn();
    const onStructureSignalConsumed = vi.fn();
    render(
      <SearchResultsTree
        {...baseProps}
        structureSignal={{ action: 'collapse', target: 'dirs', nonce: 1 }}
        onStructureSignalConsumed={onStructureSignalConsumed}
        onCollapseStatusChange={onCollapseStatusChange}
      />,
    );
    expect(onStructureSignalConsumed).toHaveBeenCalled();
    const last = onCollapseStatusChange.mock.calls.at(-1)?.[0] as
      | { dirsAllCollapsed?: boolean }
      | undefined;
    expect(last?.dirsAllCollapsed).toBe(true);
  });
});
