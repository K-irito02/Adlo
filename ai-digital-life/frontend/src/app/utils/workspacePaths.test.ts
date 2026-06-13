import { describe, expect, it } from 'vitest';
import {
  normalizeWorkspaceRelativePath,
  mergeDirtyEditorPaths,
  filterDiagnosticsForPath,
  detectEditorLanguage,
  findFirstDiagnostic,
} from './workspacePaths';

describe('workspacePaths', () => {
  describe('normalizeWorkspaceRelativePath', () => {
    it('normalizes Windows backslashes to forward slashes', () => {
      expect(normalizeWorkspaceRelativePath('src\\components\\Button.tsx')).toBe(
        'src/components/Button.tsx'
      );
    });

    it('keeps Unix paths unchanged', () => {
      expect(normalizeWorkspaceRelativePath('src/components/Button.tsx')).toBe(
        'src/components/Button.tsx'
      );
    });

    it('trims whitespace', () => {
      expect(normalizeWorkspaceRelativePath('  src/file.tsx  ')).toBe('src/file.tsx');
    });

    it('handles empty string', () => {
      expect(normalizeWorkspaceRelativePath('')).toBe('');
    });
  });

  describe('mergeDirtyEditorPaths', () => {
    it('adds path when isDirty is true', () => {
      const result = mergeDirtyEditorPaths(['file1.ts'], 'file2.ts', true);
      expect(result).toContain('file2.ts');
      expect(result).toContain('file1.ts');
    });

    it('removes path when isDirty is false', () => {
      const result = mergeDirtyEditorPaths(['file1.ts', 'file2.ts'], 'file1.ts', false);
      expect(result).not.toContain('file1.ts');
      expect(result).toContain('file2.ts');
    });

    it('handles empty current array', () => {
      const result = mergeDirtyEditorPaths([], 'file.ts', true);
      expect(result).toContain('file.ts');
    });

    it('normalizes paths when merging', () => {
      const result = mergeDirtyEditorPaths(['file1.ts'], 'file2.ts', true);
      expect(result.every((p) => !p.includes('\\'))).toBe(true);
    });

    it('returns current unchanged for empty path', () => {
      const current = ['file.ts'];
      const result = mergeDirtyEditorPaths(current, '', true);
      expect(result).toEqual(current);
    });

    it('handles duplicate paths', () => {
      const result = mergeDirtyEditorPaths(['file.ts', 'file.ts'], 'file.ts', true);
      expect(result.filter((p) => p === 'file.ts').length).toBe(1);
    });
  });

  describe('detectEditorLanguage', () => {
    it('detects TypeScript', () => {
      expect(detectEditorLanguage('file.ts')).toBe('typescript');
      expect(detectEditorLanguage('file.tsx')).toBe('typescript');
    });

    it('detects JavaScript', () => {
      expect(detectEditorLanguage('file.js')).toBe('javascript');
      expect(detectEditorLanguage('file.jsx')).toBe('javascript');
      expect(detectEditorLanguage('file.mjs')).toBe('javascript');
    });

    it('detects Rust', () => {
      expect(detectEditorLanguage('file.rs')).toBe('rust');
    });

    it('detects Python', () => {
      expect(detectEditorLanguage('file.py')).toBe('python');
    });

    it('detects JSON', () => {
      expect(detectEditorLanguage('file.json')).toBe('json');
    });

    it('detects YAML', () => {
      expect(detectEditorLanguage('file.yaml')).toBe('yaml');
      expect(detectEditorLanguage('file.yml')).toBe('yaml');
    });

    it('detects Markdown', () => {
      expect(detectEditorLanguage('file.md')).toBe('markdown');
      expect(detectEditorLanguage('file.markdown')).toBe('markdown');
    });

    it('returns fallback when provided', () => {
      expect(detectEditorLanguage('file.unknown', 'custom')).toBe('custom');
    });

    it('returns plaintext for unknown extension', () => {
      expect(detectEditorLanguage('file.xyz')).toBe('plaintext');
    });

    it('returns plaintext for no extension', () => {
      expect(detectEditorLanguage('Makefile')).toBe('plaintext');
    });

    it('is case insensitive', () => {
      expect(detectEditorLanguage('file.TS')).toBe('typescript');
      expect(detectEditorLanguage('file.PY')).toBe('python');
    });

    it('detects shell', () => {
      expect(detectEditorLanguage('file.sh')).toBe('shell');
      expect(detectEditorLanguage('file.bash')).toBe('shell');
      expect(detectEditorLanguage('file.zsh')).toBe('shell');
    });

    it('detects C++', () => {
      expect(detectEditorLanguage('file.cpp')).toBe('cpp');
      expect(detectEditorLanguage('file.h')).toBe('cpp');
      expect(detectEditorLanguage('file.hpp')).toBe('cpp');
    });
  });

  describe('filterDiagnosticsForPath', () => {
    const mockDiagnostics = [
      {
        id: 'd1',
        source: 'typescript' as const,
        path: 'src/file1.ts',
        severity: 'error' as const,
        message: 'Error 1',
      },
      {
        id: 'd2',
        source: 'typescript' as const,
        path: 'src/file2.ts',
        severity: 'warning' as const,
        message: 'Warning 1',
      },
      {
        id: 'd3',
        source: 'typescript' as const,
        path: 'other/file.ts',
        severity: 'error' as const,
        message: 'Error 2',
      },
    ];

    it('filters diagnostics for exact path match', () => {
      const result = filterDiagnosticsForPath(mockDiagnostics, 'src/file1.ts');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/file1.ts');
    });

    it('handles Windows path separators', () => {
      const result = filterDiagnosticsForPath(mockDiagnostics, 'src\\file1.ts');
      expect(result).toHaveLength(1);
    });

    it('returns all diagnostics when no path provided', () => {
      const result = filterDiagnosticsForPath(mockDiagnostics);
      expect(result).toHaveLength(3);
    });

    it('is case insensitive', () => {
      const result = filterDiagnosticsForPath(mockDiagnostics, 'SRC/file1.ts');
      expect(result).toHaveLength(1);
    });

    it('returns empty array for non-matching path', () => {
      const result = filterDiagnosticsForPath(mockDiagnostics, 'nonexistent.ts');
      expect(result).toHaveLength(0);
    });
  });

  describe('findFirstDiagnostic', () => {
    it('returns first error when present', () => {
      const diagnostics = [
        {
          id: 'd1',
          source: 'typescript' as const,
          path: 'file1.ts',
          severity: 'warning' as const,
          message: 'Warning',
        },
        {
          id: 'd2',
          source: 'typescript' as const,
          path: 'file2.ts',
          severity: 'error' as const,
          message: 'Error',
        },
      ];
      const result = findFirstDiagnostic(diagnostics);
      expect(result?.severity).toBe('error');
    });

    it('returns first diagnostic when no errors', () => {
      const diagnostics = [
        {
          id: 'd1',
          source: 'typescript' as const,
          path: 'file1.ts',
          severity: 'warning' as const,
          message: 'Warning',
        },
        {
          id: 'd2',
          source: 'typescript' as const,
          path: 'file2.ts',
          severity: 'info' as const,
          message: 'Info',
        },
      ];
      const result = findFirstDiagnostic(diagnostics);
      expect(result?.path).toBe('file1.ts');
    });

    it('returns undefined for empty array', () => {
      const result = findFirstDiagnostic([]);
      expect(result).toBeUndefined();
    });
  });
});
