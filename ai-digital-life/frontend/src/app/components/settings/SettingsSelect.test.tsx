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
});
