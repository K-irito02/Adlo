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
});
