import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsSelect } from './SettingsSelect';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('SettingsSelect', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the selected label in the trigger', () => {
    render(<SettingsSelect value="b" options={OPTIONS} onChange={() => {}} label="Pick" />);
    expect(screen.getByRole('button', { name: 'Pick' }).textContent).toContain('Beta');
  });

  it('opens the menu on trigger click and selects on option click', () => {
    const onChange = vi.fn();
    render(<SettingsSelect value="a" options={OPTIONS} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.getByRole('listbox')).toBeDefined();
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not call onChange when clicking the already-selected option', () => {
    const onChange = vi.fn();
    render(<SettingsSelect value="a" options={OPTIONS} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onHoverOption on option hover and null on leave', () => {
    const onHover = vi.fn();
    render(
      <SettingsSelect
        value="a"
        options={OPTIONS}
        onChange={() => {}}
        label="Pick"
        onHoverOption={onHover}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Beta' }));
    expect(onHover).toHaveBeenCalledWith('b');
    // mouseleave 在 listbox 上派发，依赖 React 合成事件冒泡到菜单容器 div 的 onMouseLeave。
    fireEvent.mouseLeave(screen.getByRole('listbox'));
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('closes on Escape', () => {
    render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports arrow + enter keyboard selection', () => {
    const onChange = vi.fn();
    render(<SettingsSelect value="a" options={OPTIONS} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not open when disabled', () => {
    render(
      <SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" disabled />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on outside pointerdown', () => {
    render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Tab without trapping focus', () => {
    render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('returns focus to the trigger after selecting an option', () => {
    render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
    const trigger = screen.getByRole('button', { name: 'Pick' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(document.activeElement).toBe(trigger);
  });

  it('scrolls the highlighted option into view only for keyboard navigation', () => {
    // jsdom 是否自带该 API 不确定：直接挂载并按原状还原（有则恢复原函数，无则删除）。
    const proto = Element.prototype as unknown as Record<string, unknown>;
    const prev = proto.scrollIntoView;
    const scrollSpy = vi.fn();
    proto.scrollIntoView = scrollSpy;
    try {
      render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
      fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
      // 打开即同步到已选项并滚入（block nearest，可见则不动——只断言调用门控）。
      expect(scrollSpy).toHaveBeenCalled();
      scrollSpy.mockClear();
      // 鼠标悬停只换高亮，不抢滚动。
      fireEvent.mouseEnter(screen.getByRole('option', { name: 'Beta' }));
      expect(scrollSpy).not.toHaveBeenCalled();
      // 方向键导航则滚入（Beta→Gamma 有位移，触发重渲染）。
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      if (prev === undefined) {
        delete proto.scrollIntoView;
      } else {
        proto.scrollIntoView = prev;
      }
    }
  });

  it('falls back to the raw value when it matches no option', () => {
    render(<SettingsSelect value="zzz" options={OPTIONS} onChange={() => {}} label="Pick" />);
    expect(screen.getByRole('button', { name: 'Pick' }).textContent).toContain('zzz');
  });

  it('fires onHoverOption on option focus (keyboard users)', () => {
    const onHover = vi.fn();
    render(
      <SettingsSelect
        value="a"
        options={OPTIONS}
        onChange={() => {}}
        label="Pick"
        onHoverOption={onHover}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.focus(screen.getByRole('option', { name: 'Beta' }));
    expect(onHover).toHaveBeenCalledWith('b');
  });

  it('opens the menu via trigger keyboard (ArrowDown/Enter)', () => {
    render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
    const trigger = screen.getByRole('button', { name: 'Pick' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('bottom-anchors the menu to the trigger top when there is no room below', () => {
    // 触发器贴近视口底部：下方放不下 MENU_MAX_HEIGHT，应向上打开并用 CSS bottom 贴顶边
    //（不再按固定 240 推 top——短菜单会整体上浮、与触发器脱节）。
    const prevInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', {
      value: 400,
      configurable: true,
      writable: true,
    });
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 360,
      bottom: 388,
      left: 20,
      right: 140,
      width: 120,
      height: 28,
      x: 20,
      y: 360,
      toJSON: () => ({}),
    } as DOMRect);
    try {
      render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
      fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
      const menu = document.querySelector('.adl-settings-dropdown__menu') as HTMLElement;
      expect(menu).not.toBeNull();
      // bottom = innerHeight - rect.top + MENU_OFFSET(4)
      expect(menu.style.bottom).toBe(`${400 - 360 + 4}px`);
      expect(menu.style.top).toBe('');
      // 上方空间充足：maxHeight 取上限 240（= min(240, max(80, 360-4-8))）。
      expect(menu.style.maxHeight).toBe('240px');
      const list = document.querySelector('.adl-settings-dropdown__list') as HTMLElement;
      expect(list.style.maxHeight).toBe('232px');
      // 横向几何：width 取 max(120, 160)，left 右对齐钳制（jsdom innerWidth 1024）。
      expect(menu.style.width).toBe('160px');
      expect(menu.style.left).toBe('8px');
    } finally {
      spy.mockRestore();
      Object.defineProperty(window, 'innerHeight', {
        value: prevInnerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it('clears the stale side when flipping between down and up, with dynamic maxHeight', () => {
    // 先高视口向下打开，再压视口触发 resize 翻转向上：旧 top 内联必须清除。
    const prevInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      configurable: true,
      writable: true,
    });
    const rect = {
      top: 100,
      bottom: 128,
      left: 20,
      right: 140,
      width: 120,
      height: 28,
      x: 20,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    try {
      render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
      fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
      let menu = document.querySelector('.adl-settings-dropdown__menu') as HTMLElement;
      expect(menu.style.top).not.toBe('');
      expect(menu.style.bottom).toBe('');
      expect(menu.style.maxHeight).toBe('');
      // 压到 200px：下方放不下 240 → resize 后向上打开。
      Object.defineProperty(window, 'innerHeight', {
        value: 200,
        configurable: true,
        writable: true,
      });
      fireEvent(window, new Event('resize'));
      menu = document.querySelector('.adl-settings-dropdown__menu') as HTMLElement;
      expect(menu.style.top).toBe('');
      expect(menu.style.bottom).toBe(`${200 - 100 + 4}px`);
      // 上缘保护：min(240, max(80, 100-4-8)) = 88，列表区同步收窄 80。
      expect(menu.style.maxHeight).toBe('88px');
      const list = document.querySelector('.adl-settings-dropdown__list') as HTMLElement;
      expect(list.style.maxHeight).toBe('80px');
    } finally {
      spy.mockRestore();
      Object.defineProperty(window, 'innerHeight', {
        value: prevInnerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it('flips back down and clears the upper side when space returns', () => {
    // 先小视口向上打开，再放大视口 resize：旧 bottom/maxHeight 内联必须清除。
    const prevInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', {
      value: 200,
      configurable: true,
      writable: true,
    });
    const rect = {
      top: 100,
      bottom: 128,
      left: 20,
      right: 140,
      width: 120,
      height: 28,
      x: 20,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    try {
      render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
      fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
      let menu = document.querySelector('.adl-settings-dropdown__menu') as HTMLElement;
      expect(menu.style.bottom).not.toBe('');
      Object.defineProperty(window, 'innerHeight', {
        value: 800,
        configurable: true,
        writable: true,
      });
      fireEvent(window, new Event('resize'));
      menu = document.querySelector('.adl-settings-dropdown__menu') as HTMLElement;
      expect(menu.style.top).toBe(`${128 + 4}px`);
      expect(menu.style.bottom).toBe('');
      expect(menu.style.maxHeight).toBe('');
    } finally {
      spy.mockRestore();
      Object.defineProperty(window, 'innerHeight', {
        value: prevInnerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it('clamps to the minimum height at the extreme top', () => {
    // rect.top=30/innerHeight=300：下方放不下 240 → 向上；可用高度 30-4-8=18 < 80 → 钳制 80。
    const prevInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', {
      value: 300,
      configurable: true,
      writable: true,
    });
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 30,
      bottom: 58,
      left: 20,
      right: 140,
      width: 120,
      height: 28,
      x: 20,
      y: 30,
      toJSON: () => ({}),
    } as DOMRect);
    try {
      render(<SettingsSelect value="a" options={OPTIONS} onChange={() => {}} label="Pick" />);
      fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
      const menu = document.querySelector('.adl-settings-dropdown__menu') as HTMLElement;
      expect(menu.style.bottom).toBe(`${300 - 30 + 4}px`);
      expect(menu.style.maxHeight).toBe('80px');
      const list = document.querySelector('.adl-settings-dropdown__list') as HTMLElement;
      expect(list.style.maxHeight).toBe('72px');
    } finally {
      spy.mockRestore();
      Object.defineProperty(window, 'innerHeight', {
        value: prevInnerHeight,
        configurable: true,
        writable: true,
      });
    }
  });
});
