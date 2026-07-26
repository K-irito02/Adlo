import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModuleTreeCard } from './ModuleTreeCard';
import type { ModuleTreeNode } from './moduleTreeUtils';

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('.adl-module-tree-card').forEach((el) => el.remove());
  vi.clearAllMocks();
});

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisModuleCancel: 'Cancel',
      gitVisModuleConfirm: 'Confirm',
      gitVisModuleExpandAll: 'Expand All',
      gitVisModuleCollapseAll: 'Collapse All',
    },
    locale: 'en',
  }),
}));

const mockSubtree: ModuleTreeNode[] = [
  {
    name: 'src',
    path: 'src',
    isDir: true,
    children: [
      {
        name: 'components',
        path: 'src/components',
        isDir: true,
        children: [{ name: 'bar.tsx', path: 'src/components/bar.tsx', isDir: false, children: [] }],
      },
      { name: 'utils', path: 'src/utils', isDir: true, children: [] },
    ],
  },
  {
    name: 'docs',
    path: 'docs',
    isDir: true,
    children: [{ name: 'readme.md', path: 'docs/readme.md', isDir: false, children: [] }],
  },
];

describe('ModuleTreeCard', () => {
  it('should render tree nodes', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('docs')).toBeInTheDocument();
  });

  it('should expand directory on row label click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('utils')).toBeInTheDocument();
  });

  it('should select a row on click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    const treeItem = screen.getByRole('treeitem', { name: /src/ });
    expect(treeItem.className).toContain('is-selected');
  });

  it('should call onSelect with selected path on confirm', () => {
    const onSelect = vi.fn();
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('src'));
    fireEvent.click(screen.getByText('Confirm'));
    expect(onSelect).toHaveBeenCalledWith('src');
  });

  it('should call onClose on Cancel', () => {
    const onClose = vi.fn();
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('should render expand all / collapse all buttons', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.getByText('Collapse All')).toBeInTheDocument();
  });

  it('should expand all directories on Expand All click', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Expand All'));
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('utils')).toBeInTheDocument();
    expect(screen.getByText('bar.tsx')).toBeInTheDocument();
    expect(screen.getByText('readme.md')).toBeInTheDocument();
  });

  it('should collapse all directories on Collapse All click after expand', () => {
    render(
      <ModuleTreeCard
        subtree={mockSubtree}
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Expand All'));
    expect(screen.getByText('bar.tsx')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Collapse All'));
    expect(screen.queryByText('components')).not.toBeInTheDocument();
    expect(screen.queryByText('bar.tsx')).not.toBeInTheDocument();
  });
});
