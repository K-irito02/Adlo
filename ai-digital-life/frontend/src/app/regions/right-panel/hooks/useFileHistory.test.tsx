import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { useFileHistory, type FileHistoryEntry } from './useFileHistory';

function Harness({ onNavigate }: { onNavigate: (entry: FileHistoryEntry) => void }) {
  const [file, setFile] = useState<FileHistoryEntry | undefined>(undefined);
  const history = useFileHistory(file?.path, file?.workspaceId, onNavigate);
  return (
    <div>
      <button onClick={() => setFile({ path: 'a.md', workspaceId: 'ws1' })}>set-a-ws1</button>
      <button onClick={() => setFile({ path: 'b.md', workspaceId: 'ws1' })}>set-b-ws1</button>
      <button onClick={() => setFile({ path: 'a.md', workspaceId: 'ws2' })}>set-a-ws2</button>
      <button onClick={history.navigateBack}>back</button>
      <button onClick={history.navigateForward}>forward</button>
      <span data-testid="can-back">{String(history.canGoBack)}</span>
      <span data-testid="can-forward">{String(history.canGoForward)}</span>
    </div>
  );
}

describe('useFileHistory', () => {
  afterEach(() => {
    cleanup();
  });

  it('records the owning workspace and navigates back within it', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('set-a-ws1'));
    fireEvent.click(screen.getByText('set-b-ws1'));
    fireEvent.click(screen.getByText('back'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith({ path: 'a.md', workspaceId: 'ws1' });
  });

  it('treats the same path in another workspace as a separate entry', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('set-a-ws1'));
    fireEvent.click(screen.getByText('set-b-ws1'));
    fireEvent.click(screen.getByText('set-a-ws2'));
    fireEvent.click(screen.getByText('back'));
    fireEvent.click(screen.getByText('back'));
    expect(onNavigate).toHaveBeenLastCalledWith({ path: 'a.md', workspaceId: 'ws1' });
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('forwards through entries with their own workspaces', () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('set-a-ws1'));
    fireEvent.click(screen.getByText('set-b-ws1'));
    fireEvent.click(screen.getByText('back'));
    fireEvent.click(screen.getByText('forward'));
    expect(onNavigate).toHaveBeenLastCalledWith({ path: 'b.md', workspaceId: 'ws1' });
  });

  it('still records later entries after a failed back navigation', () => {
    // 打开失败时落点不变：失败的导航不能毒化后续正常记录（复审 N5）。
    let failNextOpen = false;
    function FailHarness() {
      const [file, setFile] = useState<FileHistoryEntry | undefined>(undefined);
      const history = useFileHistory(file?.path, file?.workspaceId, (entry) => {
        if (failNextOpen) {
          failNextOpen = false;
          return;
        }
        setFile(entry);
      });
      return (
        <div>
          <button onClick={() => setFile({ path: 'a.md', workspaceId: 'ws1' })}>set-a-ws1</button>
          <button onClick={() => setFile({ path: 'b.md', workspaceId: 'ws1' })}>set-b-ws1</button>
          <button onClick={() => setFile({ path: 'c.md', workspaceId: 'ws1' })}>set-c-ws1</button>
          <button onClick={history.navigateBack}>back</button>
          <button onClick={history.navigateForward}>forward</button>
          <span data-testid="can-back">{String(history.canGoBack)}</span>
          <span data-testid="current">{file?.path ?? ''}</span>
        </div>
      );
    }
    render(<FailHarness />);
    fireEvent.click(screen.getByText('set-a-ws1'));
    fireEvent.click(screen.getByText('set-b-ws1'));
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByTestId('can-back').textContent).toBe('false');
    // 前进打开失败：落点停在 a.md。
    failNextOpen = true;
    fireEvent.click(screen.getByText('forward'));
    // 随后用户正常打开 c.md：必须被记录，而不是被残留标记吞掉。
    fireEvent.click(screen.getByText('set-c-ws1'));
    expect(screen.getByTestId('can-back').textContent).toBe('true');
    fireEvent.click(screen.getByText('back'));
    // 回退应落到 b.md（c 之前确有记录；b.md 的失败前进没有留下幽灵条目，
    // 旧实现会把 c 吞掉、回退直接落到 a.md）。
    expect(screen.getByTestId('current').textContent).toBe('b.md');
  });
});
