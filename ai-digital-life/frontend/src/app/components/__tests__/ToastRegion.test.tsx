import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { ToastRegion } from '../ToastRegion';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const formatMap: Record<string, string> = {
      errorsWorkspace: 'Workspace error',
      errorsInfo: 'Notice',
      errorsCopy: 'Copy',
      errorsCopied: 'Copied',
      errorsClose: 'Close',
      errorsCollapse: 'Collapse',
      errorsExpand: 'Expand',
      errorsMore: '{n} more',
      errorsClearAll: 'Clear all',
      errorsRegionLabel: 'Error notifications',
      fileCreateDuplicateFileTitle: 'Cannot create file',
      fileCreateDuplicateFolderTitle: 'Cannot create folder',
      fileCreateDuplicateFile: 'A file or folder with the same name already exists here «{name}»',
      fileCreateDuplicateFolder: 'A file or folder with the same name already exists here «{name}»',
      fileOpNoticeRegionLabel: 'File operation notice',
    };
    return key in formatMap ? formatMap[key as string] : typeof key === 'string' ? key : '';
  },
});

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as never} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('ToastRegion', () => {
  it('renders error toasts and file-op notices in one region with two labeled groups', () => {
    render(
      <TestProvider>
        <ToastRegion
          errorToasts={[{ id: 'e1', code: 'WORKSPACE_ERROR', detail: 'boom' }]}
          onDismissError={vi.fn()}
          onClearAllError={vi.fn()}
          notices={[{ id: 'n1', kind: 'file', name: 'src', timestamp: 0 }]}
          onDismissNotice={vi.fn()}
        />
      </TestProvider>,
    );
    const region = document.body.querySelector('.toast-card-region');
    expect(region).toBeTruthy();
    expect(region?.querySelectorAll('.toast-card-region__group').length).toBe(2);
    expect(region?.querySelectorAll('.toast-card').length).toBe(2);
    expect(screen.getByText('Workspace error')).toBeTruthy();
    expect(screen.getByText('Cannot create file')).toBeTruthy();
  });
});
