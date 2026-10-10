import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FidelityWatermark } from '../FidelityWatermark';

describe('FidelityWatermark', () => {
  it('renders bold plain text pinned to the top-right without decorations', () => {
    render(<FidelityWatermark text="hint text" fileKey="a.docx" />);
    const hint = screen.getByText('hint text');
    expect(hint.className).toContain('adl-fidelity-watermark');
    expect(hint.getAttribute('role')).toBe('note');
  });

  it('leaves the DOM after the fade-out animation ends', () => {
    render(<FidelityWatermark text="hint text" fileKey="a.docx" />);
    expect(screen.getByText('hint text')).toBeTruthy();
    fireEvent.animationEnd(screen.getByText('hint text'));
    expect(screen.queryByText('hint text')).toBeNull();
  });
});
