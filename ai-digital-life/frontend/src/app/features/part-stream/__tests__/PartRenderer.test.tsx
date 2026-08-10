import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartRenderer, PART_MAPPING, registerPart } from '../PartRenderer';
import type { PartType, PartData, PartRecord, MessageRecord } from '../../../../kernel/types-part';

function mkPart(type: PartType, data: PartData): PartRecord {
  return {
    id: 'p1',
    messageID: 'm1',
    sessionID: 's1',
    type,
    ordinal: 0,
    timeCreated: 0,
    data,
  };
}

const mkMessage = (): MessageRecord => ({
  id: 'm1',
  sessionID: 's1',
  role: 'assistant',
  timeCreated: 0,
});

describe('PartRenderer', () => {
  it('dispatches to the registered component by part.data.type', () => {
    registerPart('text', ({ part }) => <div data-testid="text-part">{part.id}</div>);
    const { unmount } = render(
      <PartRenderer message={mkMessage()} part={mkPart('text', { type: 'text', text: 'hi' })} />,
    );
    expect(screen.getByTestId('text-part')).toHaveTextContent('p1');
    unmount();
  });

  it('forwards defaultOpen to the component', () => {
    let seen: unknown;
    registerPart('tool', (props) => {
      seen = props.defaultOpen;
      return null;
    });
    const { unmount } = render(
      <PartRenderer
        message={mkMessage()}
        part={mkPart('tool', {
          type: 'tool',
          tool: 'read',
          callID: 'c1',
          state: { status: 'completed' as const, input: {}, output: '', time: { start: 0 } },
        })}
        defaultOpen
      />,
    );
    expect(seen).toBe(true);
    unmount();
  });

  it('renders null for an unregistered part type', () => {
    const { container } = render(
      <PartRenderer message={mkMessage()} part={mkPart('step-finish', { type: 'step-finish' })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('registerPart mutates PART_MAPPING', () => {
    const Comp = () => <div />;
    registerPart('snapshot', Comp);
    expect(PART_MAPPING['snapshot']).toBe(Comp);
  });
});
