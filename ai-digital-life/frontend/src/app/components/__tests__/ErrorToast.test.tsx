import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { ErrorToastContainer } from '../ErrorToast';
import type { ErrorToastEntry } from '../../stores/slices/errorToastSlice';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const formatMap: Record<string, string> = {
      errorsGenericTitle: 'Operation failed',
      errorsWorkspace: 'Workspace error',
      errorsNotFound: 'Not found',
      errorsCopy: 'Copy',
      errorsCopied: 'Copied',
      errorsClose: 'Close',
      errorsCollapse: 'Collapse',
      errorsExpand: 'Expand',
      errorsMore: '{n} more',
      errorsClearAll: 'Clear all',
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

function entry(overrides: Partial<ErrorToastEntry> = {}): ErrorToastEntry {
  return { id: 'e1', code: 'WORKSPACE_ERROR', detail: 'Workspace error: fatal', ...overrides };
}

describe('ErrorToastContainer', () => {
  it('renders title and full detail by default (expanded)', () => {
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText('Workspace error')).toBeTruthy();
    expect(screen.getByText('Workspace error: fatal')).toBeTruthy();
  });

  it('collapses when the collapse button is clicked', () => {
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy();
  });

  it('copies the full detail when copy is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('Workspace error: fatal'));
  });

  it('dismisses a toast when close is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={onDismiss} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledWith('e1');
  });

  it('shows a summary with the hidden count when over the limit and clears all', () => {
    const onClearAll = vi.fn();
    const many = Array.from({ length: 7 }, (_, i) => entry({ id: `e${i}`, detail: `detail ${i}` }));
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={many} onDismiss={vi.fn()} onClearAll={onClearAll} />
      </TestProvider>,
    );
    expect(screen.getByText('2 more')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('falls back to the generic title for unknown codes', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[entry({ code: 'UNKNOWN_CODE' })]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    expect(screen.getByText('Operation failed')).toBeTruthy();
  });
});
