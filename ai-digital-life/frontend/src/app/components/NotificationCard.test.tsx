import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../i18n/TCopyContext';
import { NotificationCard } from './NotificationCard';
import type { NotificationData } from '@stores/slices/notificationSlice';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const formatMap: Record<string, string> = {
      relativeTimeJustNow: 'Just now',
      relativeTimeMinutesAgo: '{n} 分钟前',
      relativeTimeHoursAgo: '{n} 小时前',
      relativeTimeDaysAgo: '{n} 天前',
      notifConflictTitle: 'Merge conflict',
    };
    return key in formatMap ? formatMap[key as string] : typeof key === 'string' ? key : '';
  },
});

const mockNotif: NotificationData = {
  id: 'n1',
  type: 'conflict',
  title: 'Merge conflict',
  summary: '2 files with conflicts',
  fullInfo: 'Full details here',
  timestamp: Date.now() - 120000,
  read: false,
};

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as any} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('NotificationCard', () => {
  it('renders title and summary', () => {
    render(
      <TestProvider>
        <NotificationCard notification={mockNotif} onClose={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText('Merge conflict')).toBeTruthy();
    expect(screen.getByText('2 files with conflicts')).toBeTruthy();
  });

  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn();
    render(
      <TestProvider>
        <NotificationCard notification={mockNotif} onClose={onClose} />
      </TestProvider>,
    );
    screen.getByRole('button', { name: /close/i }).click();
    expect(onClose).toHaveBeenCalledWith('n1');
  });

  it('renders relative time', () => {
    render(
      <TestProvider>
        <NotificationCard notification={mockNotif} onClose={vi.fn()} />
      </TestProvider>,
    );
    expect(screen.getByText(/2 分钟前/)).toBeTruthy();
  });
});
