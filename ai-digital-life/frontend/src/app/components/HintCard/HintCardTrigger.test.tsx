import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HintCardTrigger } from './HintCardTrigger';

describe('HintCardTrigger', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
  });

  it('renders children', () => {
    render(
      <HintCardTrigger content="hint">
        <button>!</button>
      </HintCardTrigger>,
    );
    expect(screen.getByText('!')).toBeTruthy();
  });

  it('shows card on click', async () => {
    render(
      <HintCardTrigger content="hint text">
        <button>!</button>
      </HintCardTrigger>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('!'));
    });
    expect(screen.getByText('hint text')).toBeTruthy();
  });

  it('hides card on second click', async () => {
    render(
      <HintCardTrigger content="hint text">
        <button>!</button>
      </HintCardTrigger>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('!'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('!'));
    });
    expect(screen.queryByText('hint text')).toBeNull();
  });
});
