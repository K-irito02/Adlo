import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { PartTimeline } from '../PartTimeline';
import type { SessionPartState } from '../partStoreTypes';

/**
 * Mock react-window so we can observe `scrollToRow` on the List ref. The mock
 * List renders every row through the real rowComponent (content assertions
 * still work) and reports the visible range through `onRowsRendered` —
 * `control.atBottom` picks whether the user is pinned to the bottom.
 */
const control = vi.hoisted(() => {
  const scrollToRow = vi.fn();
  return {
    scrollToRow,
    atBottom: true,
    listRef: { current: { scrollToRow } },
  };
});

vi.mock('react-window', () => ({
  List: ({
    rowCount,
    rowComponent: Row,
    rowProps,
    onRowsRendered,
  }: {
    rowCount: number;
    rowComponent: React.FC<{ index: number; style: React.CSSProperties }>;
    rowProps: { rows: unknown[]; partsByMessage: Map<string, unknown[]> };
    onRowsRendered?: (visibleRows: { startIndex: number; stopIndex: number }) => void;
  }) => {
    onRowsRendered?.({
      startIndex: 0,
      stopIndex: control.atBottom ? rowCount - 1 : 0,
    });
    return (
      <div data-testid="mock-list">
        {Array.from({ length: rowCount }, (_, index) => (
          <Row key={index} index={index} style={{}} {...rowProps} />
        ))}
      </div>
    );
  },
  useListRef: () => control.listRef,
  useDynamicRowHeight: () => 200,
}));

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function wrap(children: React.ReactNode) {
  return (
    <TCopyProvider t={mockT as never} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function makeState(messageIds: string[]): SessionPartState {
  const msgMap = new Map(
    messageIds.map((id) => [id, { id, sessionID: 's1', role: 'user', timeCreated: 0 } as never]),
  );
  return { messages: msgMap, partsByMessage: new Map(), status: 'idle', questions: [] };
}

function textMap(ids: string[]) {
  return new Map(ids.map((id) => [id, `text-${id}`]));
}

beforeEach(() => {
  control.scrollToRow.mockClear();
  control.atBottom = true;
});

describe('PartTimeline scroll-follow parity (MessageStream onRowsRendered + scrollToRow)', () => {
  it('scrolls to the last row when a new message arrives while pinned at bottom', () => {
    const { rerender } = render(
      wrap(<PartTimeline state={makeState(['u1'])} userTextByMessageId={textMap(['u1'])} />),
    );
    control.scrollToRow.mockClear();
    rerender(
      wrap(
        <PartTimeline
          state={makeState(['u1', 'a1'])}
          userTextByMessageId={textMap(['u1', 'a1'])}
        />,
      ),
    );
    expect(control.scrollToRow).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, align: 'end' }),
    );
  });

  it('does not yank the viewport when the user has scrolled away from the bottom', () => {
    control.atBottom = false;
    const { rerender } = render(
      wrap(
        <PartTimeline
          state={makeState(['u1', 'a1'])}
          userTextByMessageId={textMap(['u1', 'a1'])}
        />,
      ),
    );
    control.scrollToRow.mockClear();
    rerender(
      wrap(
        <PartTimeline
          state={makeState(['u1', 'a1', 'a2'])}
          userTextByMessageId={textMap(['u1', 'a1', 'a2'])}
        />,
      ),
    );
    expect(control.scrollToRow).not.toHaveBeenCalled();
  });
});
