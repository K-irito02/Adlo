import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HintCard } from './HintCard';

function makeRect(left: number, top: number): DOMRect {
  return {
    left,
    top,
    right: left + 16,
    bottom: top + 16,
    width: 16,
    height: 16,
    x: left,
    y: top,
    toJSON() {},
  };
}

describe('HintCard', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      <HintCard visible={false} triggerRect={makeRect(100, 100)}>
        hint text
      </HintCard>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders card with string content', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          hello world
        </HintCard>,
      );
    });
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('parses bullet lines from string', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          {'· item one\n· item two'}
        </HintCard>,
      );
    });
    expect(screen.getByText('item one')).toBeTruthy();
    expect(screen.getByText('item two')).toBeTruthy();
  });

  it('renders # heading lines as titled sections', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          {'# 简介\n正文'}
        </HintCard>,
      );
    });
    const title = document.querySelector('.hint-card__title');
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe('简介');
    expect(screen.getByText('正文')).toBeTruthy();
  });

  it('renders a real two-title hint composition with headings in order', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          {'# 简介\n随应用程序启动立即加载\n# 优先加载列表\n· 加载时机：启动时'}
        </HintCard>,
      );
    });
    const titles = document.querySelectorAll('.hint-card__title');
    expect(titles).toHaveLength(2);
    expect(titles[0].textContent).toBe('简介');
    expect(titles[1].textContent).toBe('优先加载列表');
    expect(titles[0].getAttribute('role')).toBe('heading');
    expect(screen.getByText('随应用程序启动立即加载')).toBeTruthy();
  });

  it('does not render empty # titles as blank headings', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          {'# \n正文'}
        </HintCard>,
      );
    });
    const titles = document.querySelectorAll('.hint-card__title');
    expect(titles).toHaveLength(0);
    // 空标题 '# ' 降级为普通行
    const lines = document.querySelectorAll('.hint-card__line');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].textContent).toBe('# ');
    expect(screen.getByText('正文')).toBeTruthy();
  });

  it('renders ReactNode content directly', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          <div data-testid="custom">custom content</div>
        </HintCard>,
      );
    });
    expect(screen.getByTestId('custom')).toBeTruthy();
  });
});
