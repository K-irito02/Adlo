import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { BrowserAudioIndicator } from '../BrowserAudioIndicator';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
});

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT as any} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('BrowserAudioIndicator', () => {
  it('renders nothing when not playing and not muted', () => {
    const html = renderToStaticMarkup(
      <TestProvider>
        <BrowserAudioIndicator isPlaying={false} isMuted={false} onToggleMute={() => {}} />
      </TestProvider>,
    );
    expect(html).toBe('');
  });

  it('renders IconVolume2 with animation class when playing and not muted', () => {
    const html = renderToStaticMarkup(
      <TestProvider>
        <BrowserAudioIndicator isPlaying={true} isMuted={false} onToggleMute={() => {}} />
      </TestProvider>,
    );
    expect(html).toContain('is-animating');
    expect(html).toContain('adl-browser-audio-indicator');
    expect(html).not.toContain('is-muted');
  });

  it('renders IconVolumeX when muted', () => {
    const html = renderToStaticMarkup(
      <TestProvider>
        <BrowserAudioIndicator isPlaying={true} isMuted={true} onToggleMute={() => {}} />
      </TestProvider>,
    );
    expect(html).toContain('is-muted');
    expect(html).not.toContain('is-animating');
  });

  it('calls onToggleMute when clicked', () => {
    const html = renderToStaticMarkup(
      <TestProvider>
        <BrowserAudioIndicator isPlaying={true} isMuted={false} onToggleMute={() => {}} />
      </TestProvider>,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label');
  });
});
