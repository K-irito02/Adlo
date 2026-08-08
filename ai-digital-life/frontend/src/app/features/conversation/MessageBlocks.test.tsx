import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { MessageBlocks } from './MessageBlocks';
import type { ConversationMessageRecord } from '@shared/ipc';
import type { CopyDict } from '@i18n';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function wrap(children: React.ReactNode) {
  return (
    <TCopyProvider t={mockT as any} locale="zh-CN">
      {children}
    </TCopyProvider>
  );
}

function message(blocks: ConversationMessageRecord['blocks']): ConversationMessageRecord {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'assistant',
    content: 'content',
    blocks,
    createdAt: 1,
  };
}

describe('MessageBlocks approval block', () => {
  it('renders an approval block with title, risk and summary', () => {
    render(
      wrap(
        <MessageBlocks
          t={mockT as CopyDict}
          message={message([
            {
              id: 'a1',
              type: 'approval',
              title: '删除旧代码',
              riskLevel: 'high',
              summary: '不可恢复',
            },
          ])}
        />,
      ),
    );
    expect(screen.getByText('删除旧代码')).toBeTruthy();
    expect(screen.getByText('high')).toBeTruthy();
    expect(screen.getByText('不可恢复')).toBeTruthy();
  });
});
