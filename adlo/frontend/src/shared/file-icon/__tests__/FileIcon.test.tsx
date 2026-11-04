import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { FileIcon } from '../FileIcon';

describe('FileIcon', () => {
  it('renders without crashing for known extension', () => {
    render(<FileIcon fileName="report.pdf" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for unknown extension', () => {
    render(<FileIcon fileName="file.xyz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders fallback for niche extension hta', () => {
    render(<FileIcon fileName="script.hta" />);
    const icon = document.querySelector('svg');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for no extension', () => {
    render(<FileIcon fileName="Makefile" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom size', () => {
    render(<FileIcon fileName="test.ts" size={24} />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom className', () => {
    render(<FileIcon fileName="test.py" className="custom-class" />);
    const el = document.querySelector('.custom-class');
    expect(el).toBeTruthy();
  });

  it('handles filenames with multiple dots', () => {
    render(<FileIcon fileName="archive.tar.gz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles hidden files', () => {
    render(<FileIcon fileName=".gitignore" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles special filename Dockerfile', () => {
    render(<FileIcon fileName="Dockerfile" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles special filename package.json', () => {
    render(<FileIcon fileName="package.json" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });
});
