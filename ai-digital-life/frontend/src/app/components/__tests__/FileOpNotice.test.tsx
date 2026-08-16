import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { FileOpNoticeContainer } from '../FileOpNotice';
import type { FileOpNotice } from '../../stores/slices/fileOpNoticeSlice';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const formatMap: Record<string, string> = {
      fileCreateDuplicateFileTitle: 'Cannot create file',
      fileCreateDuplicateFolderTitle: 'Cannot create folder',
      fileCreateDuplicateFile: 'A file or folder with the same name already exists here «{name}»',
      fileCreateDuplicateFolder: 'A file or folder with the same name already exists here «{name}»',
      fileCreateDuplicateFileSuffixHint: 'Please check the file type suffix',
      fileOpNoticeRegionLabel: 'File operation notice',
      errorsCollapse: 'Collapse',
      errorsExpand: 'Expand',
      errorsCopy: 'Copy',
      errorsCopied: 'Copied',
      errorsClose: 'Close',
      errorsMore: '{n} more',
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

function notice(overrides: Partial<FileOpNotice> = {}): FileOpNotice {
  return { id: 'n1', kind: 'file', name: 'src', timestamp: Date.now(), ...overrides };
}

describe('FileOpNoticeContainer', () => {
  it('renders the duplicate-file title and detail', () => {
    render(
      <TestProvider>
        <FileOpNoticeContainer notices={[notice()]} onDismiss={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText('Cannot create file')).toBeTruthy();
    expect(
      screen.getByText('A file or folder with the same name already exists here «src»'),
    ).toBeTruthy();
  });

  it('renders the duplicate-folder title and detail for folder kind', () => {
    render(
      <TestProvider>
        <FileOpNoticeContainer notices={[notice({ kind: 'folder' })]} onDismiss={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText('Cannot create folder')).toBeTruthy();
    expect(
      screen.getByText('A file or folder with the same name already exists here «src»'),
    ).toBeTruthy();
  });

  it('shows the suffix hint when the target is a directory', () => {
    render(
      <TestProvider>
        <FileOpNoticeContainer notices={[notice({ suffixHint: true })]} onDismiss={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText(/Please check the file type suffix/)).toBeTruthy();
  });

  it('omits the suffix hint when not flagged', () => {
    render(
      <TestProvider>
        <FileOpNoticeContainer notices={[notice()]} onDismiss={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.queryByText(/Please check the file type suffix/)).toBeNull();
  });

  it('dismisses a notice when the close button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <TestProvider>
        <FileOpNoticeContainer notices={[notice()]} onDismiss={onDismiss} />
      </TestProvider>,
    );
    screen.getByRole('button', { name: 'Close' }).click();
    expect(onDismiss).toHaveBeenCalledWith('n1');
  });

  it('shows a summary when notices exceed the visible limit', () => {
    const notices = Array.from({ length: 4 }, (_, i) => notice({ id: `n${i}` }));
    render(
      <TestProvider>
        <FileOpNoticeContainer notices={notices} onDismiss={vi.fn()} />
      </TestProvider>,
    );
    // 4 条全部可见，不出现摘要
    expect(screen.queryByText('1 more')).toBeNull();
  });

  it('summarizes the overflow count', () => {
    const notices = Array.from({ length: 5 }, (_, i) => notice({ id: `n${i}` }));
    render(
      <TestProvider>
        <FileOpNoticeContainer notices={notices} onDismiss={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText('1 more')).toBeTruthy();
  });
});
