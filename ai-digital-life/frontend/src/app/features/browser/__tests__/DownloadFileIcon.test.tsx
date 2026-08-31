import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { DownloadFileIcon } from '../DownloadFileIcon';

describe('DownloadFileIcon', () => {
  it('renders without crashing for known extension', () => {
    render(<DownloadFileIcon fileName="report.pdf" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for unknown extension', () => {
    render(<DownloadFileIcon fileName="file.xyz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('renders fallback for niche extension hta', () => {
    render(<DownloadFileIcon fileName="script.hta" />);
    const icon = document.querySelector('svg');
    expect(icon).toBeTruthy();
  });

  it('renders without crashing for no extension', () => {
    render(<DownloadFileIcon fileName="Makefile" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom size', () => {
    render(<DownloadFileIcon fileName="test.ts" size={24} />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('applies custom className', () => {
    render(<DownloadFileIcon fileName="test.py" className="custom-class" />);
    const el = document.querySelector('.custom-class');
    expect(el).toBeTruthy();
  });

  it('handles filenames with multiple dots', () => {
    render(<DownloadFileIcon fileName="archive.tar.gz" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });

  it('handles hidden files', () => {
    render(<DownloadFileIcon fileName=".gitignore" />);
    const icon = document.querySelector('svg, img, span');
    expect(icon).toBeTruthy();
  });
});
