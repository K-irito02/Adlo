import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusDot } from './StatusDot';

describe('StatusDot', () => {
  it('renders with correct color for success', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion="success" status="completed" />);
    expect(html).toContain('background');
    expect(html).toContain('var(--success)');
  });

  it('renders with correct color for failure', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion="failure" status="completed" />);
    expect(html).toContain('var(--danger)');
  });

  it('renders with correct color for in_progress', () => {
    const html = renderToStaticMarkup(<StatusDot conclusion={null} status="in_progress" />);
    expect(html).toContain('var(--warning)');
  });

  it('adds animated class when animated prop is true and status is in_progress', () => {
    const html = renderToStaticMarkup(
      <StatusDot conclusion={null} status="in_progress" animated />,
    );
    expect(html).toContain('adl-status-dot--animated');
  });

  it('does not add animated class when status is completed', () => {
    const html = renderToStaticMarkup(
      <StatusDot conclusion="success" status="completed" animated />,
    );
    expect(html).not.toContain('adl-status-dot--animated');
  });
});
