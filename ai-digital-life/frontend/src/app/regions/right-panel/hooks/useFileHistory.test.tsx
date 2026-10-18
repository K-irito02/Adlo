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
});
