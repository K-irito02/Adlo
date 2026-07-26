import { describe, it, expect } from 'vitest';
import { applyModuleMapping } from './chartDataAdapters';
import type { MappingRule } from '../types/module-mapping';

describe('applyModuleMapping', () => {
  const sampleMatrix = [
    {
      author: 'Alice',
      authorEmail: 'alice@example.com',
      modules: [
        { module: 'frontend/src', count: 30 },
        { module: 'frontend/pages', count: 20 },
        { module: 'backend/api', count: 10 },
        { module: 'docs/guide', count: 5 },
      ],
    },
  ];

  it('returns original matrix when no rules', () => {
    const result = applyModuleMapping(sampleMatrix, []);
    expect(result).toEqual(sampleMatrix);
  });

  it('maps directories to modules via glob rules', () => {
    const rules: MappingRule[] = [
      { path: 'frontend/**', module: 'Frontend', type: 'glob' },
      { path: 'backend/**', module: 'Backend', type: 'glob' },
    ];
    const result = applyModuleMapping(sampleMatrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'Frontend', count: 50 });
    expect(result[0].modules).toContainEqual({ module: 'Backend', count: 10 });
  });

  it('merges same module counts', () => {
    const matrix = [{
      author: 'Bob',
      authorEmail: 'bob@x.com',
      modules: [
        { module: 'src/button', count: 5 },
        { module: 'src/input', count: 3 },
      ],
    }];
    const rules: MappingRule[] = [
      { path: 'src/**', module: 'UI', type: 'glob' },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'UI', count: 8 });
  });

  it('keeps original module name when no rule matches', () => {
    const matrix = [{
      author: 'Charlie',
      authorEmail: 'c@x.com',
      modules: [{ module: 'vendor/lib', count: 7 }],
    }];
    const rules: MappingRule[] = [
      { path: 'src/**', module: 'Source', type: 'glob' },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'vendor/lib', count: 7 });
  });

  it('override rule takes priority over broader glob', () => {
    const matrix = [{
      author: 'Dave',
      authorEmail: 'd@x.com',
      modules: [
        { module: 'frontend/workers/thread', count: 5 },
        { module: 'frontend/src/app', count: 10 },
      ],
    }];
    const rules: MappingRule[] = [
      { path: 'frontend/**', module: 'Frontend', type: 'glob' },
      { path: 'frontend/workers/**', module: 'Backend Service', type: 'glob', override: true },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'Backend Service', count: 5 });
    expect(result[0].modules).toContainEqual({ module: 'Frontend', count: 10 });
  });

  it('override flag promotes shorter-path rule over longer-path glob', () => {
    const matrix = [{
      author: 'Eve',
      authorEmail: 'e@x.com',
      modules: [{ module: 'special/dir/file', count: 3 }],
    }];
    const rules: MappingRule[] = [
      { path: 'special/**', module: 'General', type: 'glob' },
      { path: 'special/**', module: 'Special Override', type: 'glob', override: true },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'Special Override', count: 3 });
  });

  it('handles module names with regex special chars', () => {
    const matrix = [{
      author: 'Frank',
      authorEmail: 'f@x.com',
      modules: [{ module: 'src/c++/lib', count: 5 }],
    }];
    const rules: MappingRule[] = [
      { path: 'src/c++/**', module: 'CppLib', type: 'glob' },
    ];
    const result = applyModuleMapping(matrix, rules);
    expect(result[0].modules).toContainEqual({ module: 'CppLib', count: 5 });
  });

  it('enableOtherBucket merges unmapped into Other', () => {
    const rules: MappingRule[] = [
      { path: 'frontend/**', module: 'Frontend', type: 'glob' },
    ];
    const result = applyModuleMapping(sampleMatrix, rules, { enableOtherBucket: true });
    expect(result[0].modules).toContainEqual({ module: 'Frontend', count: 50 });
    expect(result[0].modules).toContainEqual({ module: 'Other', count: 15 });
  });
});
