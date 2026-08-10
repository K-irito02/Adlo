import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TCopyProvider } from '../../../i18n/TCopyContext';
import { PartTimeline } from '../PartTimeline';
import { registerPart, type PartComponent } from '../PartRenderer';
import {
  createInitialPartState,
  hydratePartHistory,
  reducePartEvent,
  selectSessionMessages,
} from '../PartStore';
import type { MessageRecord, PartRecord } from '../../../../kernel/types-part';

/**
 * Mock react-window so every row renders through the real TimelineRowComponent
 * (content + render-count assertions still work) regardless of viewport size.
 */
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
    onRowsRendered?.({ startIndex: 0, stopIndex: rowCount - 1 });
    return (
      <div data-testid="mock-list">
        {Array.from({ length: rowCount }, (_, index) => (
          <Row key={index} index={index} style={{}} {...rowProps} />
        ))}
      </div>
    );
  },
  useListRef: () => ({ current: null }),
  useDynamicRowHeight: () => 200,
}));

/** Per-message row render counter, fed by a registered part probe. */
const renderCounts: Record<string, number> = {};

const ProbePart: PartComponent = ({ message }) => {
  renderCounts[message.id] = (renderCounts[message.id] ?? 0) + 1;
  return <div data-testid={`probe-${message.id}`} />;
};
registerPart('memo-probe', ProbePart);

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

function probePart(id: string, messageID: string): PartRecord {
  return {
    id,
    messageID,
    sessionID: 's1',
    type: 'text',
    ordinal: 0,
    timeCreated: 0,
    data: { type: 'memo-probe' } as never,
  };
}

function textPart(id: string, messageID: string, text: string): PartRecord {
  return {
    id,
    messageID,
    sessionID: 's1',
    type: 'text',
    ordinal: 1,
    timeCreated: 0,
    data: { type: 'text', text },
  };
}

/** Build a reducer-backed state so deltas preserve untouched array references. */
beforeEach(() => {
  for (const key of Object.keys(renderCounts)) {
    delete renderCounts[key];
  }
});

describe('PartTimeline row memoization (streaming re-render storm)', () => {
  it('does not re-render an unrelated row when a sibling message streams a delta', () => {
    let partState = createInitialPartState();
    const messages: MessageRecord[] = [
      { id: 'a1', sessionID: 's1', role: 'assistant', timeCreated: 1 },
      { id: 'a2', sessionID: 's1', role: 'assistant', timeCreated: 2 },
    ];
    partState = hydratePartHistory(partState, 's1', {
      messages: messages.map((message) => ({
        message,
        parts: [
          probePart(`${message.id}-p1`, message.id),
          textPart(`${message.id}-t1`, message.id, message.id === 'a1' ? 'first' : 'second'),
        ],
      })),
    });

    const { rerender } = render(
      wrap(<PartTimeline state={selectSessionMessages(partState, 's1')} />),
    );
    expect(renderCounts.a1).toBe(1);
    expect(renderCounts.a2).toBe(1);

    partState = reducePartEvent(partState, {
      type: 'message.part.delta',
      sessionID: 's1',
      messageID: 'a2',
      partID: 'a2-t1',
      field: 'text',
      delta: ' more',
    });

    rerender(wrap(<PartTimeline state={selectSessionMessages(partState, 's1')} />));

    // a2's row must re-render (its parts array gained the delta)…
    expect(renderCounts.a2).toBe(2);
    // …but a1's row must NOT (nothing it renders changed).
    expect(renderCounts.a1).toBe(1);
  });
});
