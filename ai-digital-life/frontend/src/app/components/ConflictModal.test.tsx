import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../i18n/TCopyContext';
import { ConflictModal } from './ConflictModal';
import type { NotificationData } from '@stores/slices/notificationSlice';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const formatMap: Record<string, string> = {
      relativeTimeJustNow: 'Just now',
      relativeTimeMinutesAgo: '{n} 分钟前',
      relativeTimeHoursAgo: '{n} 小时前',
      relativeTimeDaysAgo: '{n} 天前',
      notifConflictTitle: 'Conflict',
    };
    return key in formatMap ? formatMap[key as string] : typeof key === 'string' ? key : '';
  },
});

const mockNotif: NotificationData = {
  id: 'n1',
  type: 'conflict',
  title: 'Conflict',
  summary: 'Summary',
  fullInfo: 'Details',
  timestamp: Date.now(),
  read: false,
};

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as any} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('ConflictModal', () => {
  it('renders NotificationCard', () => {
    render(
      <TestProvider>
        <ConflictModal notification={mockNotif} onDismiss={vi.fn()} />
      </TestProvider>
    );
    expect(screen.getByText('Conflict')).toBeTruthy();
  });

  it('calls onDismiss when X is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <TestProvider>
        <ConflictModal notification={mockNotif} onDismiss={onDismiss} />
      </TestProvider>
    );
    screen.getByRole('button', { name: /close/i }).click();
    expect(onDismiss).toHaveBeenCalledWith('n1');
  });
});
