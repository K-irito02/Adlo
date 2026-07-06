import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SettingsHeader } from './SettingsHeader';

describe('SettingsHeader', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the title in an h3 element', () => {
    render(<SettingsHeader title="Model Providers" />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.textContent).toBe('Model Providers');
  });

  it('renders the description in a p element when provided', () => {
    render(
      <SettingsHeader
        title="Model Providers"
        description="Configure model API providers and credentials"
      />
    );
    const desc = screen.getByText('Configure model API providers and credentials');
    expect(desc.tagName).toBe('P');
  });

  it('does not render a description element when description is omitted', () => {
    render(<SettingsHeader title="Model Providers" />);
    const container = document.querySelector('.adl-settings-header');
    expect(container?.querySelector('p')).toBeNull();
  });

  it('does not render an action container when action is omitted', () => {
    render(<SettingsHeader title="Model Providers" />);
    const container = document.querySelector('.adl-settings-header');
    expect(container?.querySelector('.adl-settings-header__action')).toBeNull();
  });

  it('renders the action node inside the action container when provided', () => {
    render(
      <SettingsHeader
        title="Model Providers"
        action={<button type="button">Add Provider</button>}
      />
    );
    const actionContainer = document.querySelector('.adl-settings-header__action');
    expect(actionContainer).not.toBeNull();
    expect(actionContainer?.querySelector('button')?.textContent).toBe('Add Provider');
  });

  it('applies the adl-settings-header className to the root element', () => {
    render(<SettingsHeader title="Model Providers" />);
    const root = document.querySelector('.adl-settings-header');
    expect(root).not.toBeNull();
  });
});
