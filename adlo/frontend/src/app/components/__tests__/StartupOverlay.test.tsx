import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import StartupOverlay from '../StartupOverlay';

describe('StartupOverlay', () => {
  it('removes the static preload overlay once the React overlay mounts', () => {
    const preload = document.createElement('div');
    preload.id = 'preload-overlay';
    document.body.appendChild(preload);

    render(<StartupOverlay />);

    expect(document.getElementById('preload-overlay')).toBeNull();
  });

  it('renders the brand splash, its grid backdrop and the wordmark', () => {
    const { container } = render(<StartupOverlay />);

    expect(container.querySelector('.adl-splash')).toBeTruthy();
    expect(container.querySelector('.adl-splash__grid')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.adl-splash__name')?.textContent).toBe('Adlo · 安洛');
    expect(container.querySelector('.adl-splash__mark img')?.getAttribute('src')).toBe(
      '/adlo-icon.png',
    );
  });

  it('renders no canvas: the particle flow-field background is gone', () => {
    const { container } = render(<StartupOverlay />);

    expect(container.querySelector('canvas')).toBeNull();
  });
});
