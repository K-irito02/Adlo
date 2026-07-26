import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleMappingEditor } from './ModuleMappingEditor';
import type { MappingRule, DirectoryEntry } from './types/module-mapping';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisModuleMappingManage: 'Module Mapping',
      gitVisModuleMappingDirTree: 'Directory Tree',
      gitVisModuleMappingDefinedModules: 'Defined Modules',
      gitVisModuleMappingNewModule: 'New Module',
      gitVisModuleMappingSave: 'Save & Apply',
      gitVisModuleMappingReset: 'Reset to Default',
      gitVisModuleMappingUnmapped: 'Unmapped',
    },
    locale: 'en-US',
  }),
}));

describe('ModuleMappingEditor', () => {
  const mockTree: DirectoryEntry[] = [
    { path: 'frontend', depth: 1, commitCount: 100 },
    { path: 'frontend/src', depth: 2, commitCount: 80 },
    { path: 'backend', depth: 1, commitCount: 60 },
    { path: 'docs', depth: 1, commitCount: 20 },
  ];

  const mockRules: MappingRule[] = [
    { path: 'frontend/**', module: 'Frontend', type: 'glob' },
    { path: 'backend/**', module: 'Backend', type: 'glob' },
  ];

  it('renders when open, null when closed', () => {
    const { container: openContainer } = render(
      <ModuleMappingEditor
        isOpen={true}
        onClose={vi.fn()}
        directoryTree={mockTree}
        rules={mockRules}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(openContainer.textContent).toContain('Module Mapping');
    expect(openContainer.textContent).toContain('Frontend');
    expect(openContainer.textContent).toContain('Backend');

    const { container: closedContainer } = render(
      <ModuleMappingEditor
        isOpen={false}
        onClose={vi.fn()}
        directoryTree={mockTree}
        rules={mockRules}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(closedContainer.textContent).toBe('');
  });

  it('calls onSave when Save button clicked', () => {
    const onSave = vi.fn();
    const { container } = render(
      <ModuleMappingEditor
        isOpen={true}
        onClose={vi.fn()}
        directoryTree={mockTree}
        rules={mockRules}
        onSave={onSave}
        onReset={vi.fn()}
      />
    );
    const buttons = container.querySelectorAll('button');
    const saveButton = Array.from(buttons).find((b) => b.textContent?.includes('Save'));
    expect(saveButton).toBeTruthy();
    fireEvent.click(saveButton!);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows unmapped directories info', () => {
    const { container } = render(
      <ModuleMappingEditor
        isOpen={true}
        onClose={vi.fn()}
        directoryTree={mockTree}
        rules={mockRules}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Unmapped');
    expect(container.textContent).toContain('docs');
  });
});
