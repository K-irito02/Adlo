import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { ErrorToastContainer } from '../ErrorToast';
import type { ErrorToastEntry } from '../../stores/slices/errorToastSlice';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const formatMap: Record<string, string> = {
      errorsGenericTitle: 'Operation failed',
      errorsWorkspace: 'Workspace error',
      errorsInfo: 'Notice',
      errorsNotFound: 'Not found',
      errorsCopy: 'Copy',
      errorsCopied: 'Copied',
      errorsClose: 'Close',
      errorsCollapse: 'Collapse',
      errorsExpand: 'Expand',
      errorsMore: '{n} more',
      errorsClearAll: 'Clear all',
      errorsRegionLabel: 'Error notifications',
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

  it('defers the single-line ellipsis until the collapse transition ends', () => {
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    const detail = document.body.querySelector('.toast-card__detail');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(detail?.className).not.toContain('is-collapsed-settled');
    act(() => {
      const evt = new Event('transitionend', { bubbles: true });
      Object.defineProperty(evt, 'propertyName', { value: 'max-height' });
      detail?.dispatchEvent(evt);
    });
    expect(detail?.className).toContain('is-collapsed-settled');
  });

  it('skips silent entries in rendering while keeping them in the queue', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[
            entry({ id: 's1', code: 'IO_ERROR', detail: 'disk gone', silent: true }),
            entry({ id: 'e2', code: 'STORAGE_ERROR', detail: 'disk full' }),
          ]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    expect(screen.queryByText('disk gone')).toBeNull();
    expect(screen.getByText('disk full')).toBeTruthy();
  });

  it('marks collapse/copy as hover-only detail buttons and close as always visible', () => {
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={[entry()]} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    const collapse = screen.getByRole('button', { name: 'Collapse' });
    const copy = screen.getByRole('button', { name: 'Copy' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(collapse.className).toContain('toast-card__btn--detail');
    expect(copy.className).toContain('toast-card__btn--detail');
    expect(close.className).not.toContain('toast-card__btn--detail');
  });

  it('copies the full detail when copy is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
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

  it('applies the error level class for failure codes', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[entry({ code: 'STORAGE_ERROR', detail: 'disk full' })]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    const toast = document.body.querySelector('.toast-card:not(.toast-card--summary)');
    expect(toast?.className).toContain('toast-card--error');
  });

  it('applies the warning level class for recoverable codes', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[entry({ code: 'NOT_FOUND', detail: 'missing' })]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    const toast = document.body.querySelector('.toast-card:not(.toast-card--summary)');
    expect(toast?.className).toContain('toast-card--warning');
  });

  it('applies the info level class for non-git workspace errors', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[
            entry({
              code: 'WORKSPACE_ERROR',
              detail: 'fatal: not a git repository (or any of the parent directories): .git',
            }),
          ]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    const toast = document.body.querySelector('.toast-card:not(.toast-card--summary)');
    expect(toast?.className).toContain('toast-card--info');
  });

  it('renders a notice title for info-level toasts', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[
            entry({
              code: 'WORKSPACE_ERROR',
              detail: 'fatal: not a git repository (or any of the parent directories): .git',
            }),
          ]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    expect(screen.getByText('Notice')).toBeTruthy();
    expect(screen.queryByText('Workspace error')).toBeNull();
  });

  it('uses polite aria-live for info-level toasts and assertive for errors', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[
            entry({
              code: 'WORKSPACE_ERROR',
              detail: 'fatal: not a git repository (or any of the parent directories): .git',
            }),
            entry({
              id: 'e2',
              code: 'STORAGE_ERROR',
              detail: 'disk full',
            }),
          ]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    const infoToast = document.body.querySelector('.toast-card--info');
    const errorToast = document.body.querySelector('.toast-card--error');
    expect(infoToast?.getAttribute('role')).toBe('status');
    expect(infoToast?.getAttribute('aria-live')).toBe('polite');
    expect(errorToast?.getAttribute('role')).toBe('alert');
    expect(errorToast?.getAttribute('aria-live')).toBe('assertive');
  });

  it('keeps the summary icon the same size as toast icons', () => {
    const many = Array.from({ length: 7 }, (_, i) => entry({ id: `e${i}`, detail: `detail ${i}` }));
    render(
      <TestProvider>
        <ErrorToastContainer errorToasts={many} onDismiss={vi.fn()} onClearAll={vi.fn()} />
      </TestProvider>,
    );
    const toastIcon = document.body.querySelector(
      '.toast-card:not(.toast-card--summary) .toast-card__icon svg',
    );
    const summaryIcon = document.body.querySelector('.toast-card--summary .toast-card__icon svg');
    expect(toastIcon?.getAttribute('class')).toContain('icon--md');
    expect(summaryIcon?.getAttribute('class')).toContain('icon--md');
  });

  it('appends a ×N suffix when the entry was folded multiple times (Phase 4 F7)', () => {
    render(
      <TestProvider>
        <ErrorToastContainer
          errorToasts={[entry({ count: 3 }), entry({ id: 'e2', detail: 'once' })]}
          onDismiss={vi.fn()}
          onClearAll={vi.fn()}
        />
      </TestProvider>,
    );
    expect(screen.getByText('Workspace error: fatal ×3')).toBeTruthy();
    expect(screen.getByText('once')).toBeTruthy();
  });
});
