import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDIT_GROUPS } from './creditsData';
import { THIRD_PARTY_NOTICES } from './thirdPartyNotices';

/** Credit names backed by an npm package whose package.json is available locally. */
const PACKAGE_BY_CREDIT: Record<string, string> = {
  'React Symbols': '@react-symbols/icons',
  Lucide: 'lucide-animated',
  'react-file-icon': 'react-file-icon',
  visx: '@visx/shape',
  D3: 'd3-shape',
  CodeMirror: '@codemirror/view',
  'xterm.js': '@xterm/xterm',
  'markdown-it': 'markdown-it',
  'Starry Night': '@wooorm/starry-night',
  'PDF.js': 'pdfjs-dist',
  'docx-preview': 'docx-preview',
  'pptx-preview': 'pptx-preview',
  SheetJS: 'xlsx',
  DOMPurify: 'dompurify',
  'github-markdown-css': 'github-markdown-css',
  React: 'react',
  Vite: 'vite',
  Zustand: 'zustand',
  'Radix UI': '@radix-ui/react-switch',
  'dnd-kit': '@dnd-kit/core',
  Motion: 'motion',
  'Tailwind CSS': 'tailwindcss',
};

/** Entries that intentionally carry no short license (external tools, own terms). */
const EXTERNAL_TOOL_NAMES = new Set(['DSH', 'OpenCode CLI']);

const credits = CREDIT_GROUPS.flatMap((group) => group.items);

function normalizedLicense(value: string): string {
  return value.toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('credits data', () => {
  it('keeps names unique and every entry complete', () => {
    const names = credits.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
    for (const item of credits) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.detailKey.length).toBeGreaterThan(0);
      expect(item.url, item.name).toMatch(/^https:\/\//);
      if (EXTERNAL_TOOL_NAMES.has(item.name)) {
        expect(item.license, item.name).toBeUndefined();
      } else {
        expect(item.license, item.name).toBeTruthy();
      }
    }
  });

  it('matches the installed package license for npm-backed entries', () => {
    const byName = new Map(credits.map((item) => [item.name, item]));
    for (const [creditName, packageName] of Object.entries(PACKAGE_BY_CREDIT)) {
      const item = byName.get(creditName);
      expect(item, `missing credit for ${creditName}`).toBeDefined();
      const manifest = JSON.parse(
        readFileSync(path.join(process.cwd(), 'node_modules', packageName, 'package.json'), 'utf8'),
      ) as { license?: string };
      expect(manifest.license, `${packageName} has no license field`).toBeTruthy();
      const actual = normalizedLicense(manifest.license ?? '');
      const expectedTokens = String(item?.license)
        .split('/')
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
      for (const token of expectedTokens) {
        expect(
          actual,
          `${creditName}: expected ${token}, package says ${manifest.license}`,
        ).toContain(token);
      }
    }
  });
});

describe('third-party notices', () => {
  it('keeps names unique and includes the full MIT text', () => {
    const names = THIRD_PARTY_NOTICES.map((notice) => notice.name);
    expect(new Set(names).size).toBe(names.length);
    for (const notice of THIRD_PARTY_NOTICES) {
      expect(notice.name.length).toBeGreaterThan(0);
      expect(notice.license).toBe('MIT');
      expect(notice.url).toMatch(/^https:\/\//);
      expect(notice.detailKey.length).toBeGreaterThan(0);
      expect(notice.text).toContain('Permission is hereby granted');
      expect(notice.text).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    }
  });

  it('records the upstream copyright lines (Devicons has none upstream)', () => {
    const byName = new Map(THIRD_PARTY_NOTICES.map((notice) => [notice.name, notice]));
    expect(byName.get('bklit-ui')?.copyright).toBe('Copyright (c) 2026 uixmat');
    expect(byName.get('React Symbols')?.copyright).toBe('Copyright (c) 2022 Pablo Hernández');
    expect(byName.get('Untitled UI')?.copyright).toBe('Copyright (c) 2025 Untitled UI');
    expect(byName.get('Devicons')?.copyright).toBeUndefined();
  });
});
