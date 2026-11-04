import { describe, expect, it } from 'vitest';
import {
  buildOutlineFromContent,
  buildOutlineTree,
  flattenVisibleOutlineNodes,
  getDefaultExpandedOutlineIds,
} from './outlineModel';

describe('outline model', () => {
  it('keeps full markdown heading text and ignores fenced headings', () => {
    const items = buildOutlineFromContent(
      [
        '# Adlo - 项目治理规则 ###',
        '',
        '```md',
        '# Hidden',
        '```',
        '## 当前阶段',
        '### 已实现功能',
      ].join('\n'),
      'AGENTS.md',
    );

    expect(
      items.map((item) => ({ label: item.label, depth: item.depth, line: item.line })),
    ).toEqual([
      { label: 'Adlo - 项目治理规则', depth: 1, line: 1 },
      { label: '当前阶段', depth: 2, line: 6 },
      { label: '已实现功能', depth: 3, line: 7 },
    ]);
  });

  it('builds nested heading trees and defaults expandable parents open', () => {
    const items = buildOutlineFromContent(
      ['# Root', '## Child', '### Grandchild', '## Sibling'].join('\n'),
      'README.md',
    );
    const tree = buildOutlineTree(items);
    const expanded = getDefaultExpandedOutlineIds(items);
    const visible = flattenVisibleOutlineNodes(tree, expanded);

    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((item) => item.label)).toEqual(['Child', 'Sibling']);
    expect(tree[0].children[0].children[0].label).toBe('Grandchild');
    expect([...expanded]).toEqual(['README.md:1', 'README.md:2']);
    expect(visible.map(({ item, depth }) => `${depth}:${item.label}`)).toEqual([
      '1:Root',
      '2:Child',
      '3:Grandchild',
      '2:Sibling',
    ]);
  });

  it('hides descendants when a parent is collapsed', () => {
    const items = buildOutlineFromContent(
      ['# Root', '## Child', '### Grandchild'].join('\n'),
      'README.md',
    );
    const tree = buildOutlineTree(items);
    const visible = flattenVisibleOutlineNodes(tree, new Set());

    expect(visible.map(({ item }) => item.label)).toEqual(['Root']);
  });

  it('extracts code symbols as flat outline entries', () => {
    const items = buildOutlineFromContent(
      ['export function buildModel() {}', 'interface Config {}', 'pub struct Runtime {}'].join(
        '\n',
      ),
      'src/lib.ts',
    );

    expect(items.map((item) => ({ kind: item.kind, label: item.label, line: item.line }))).toEqual([
      { kind: 'function', label: 'buildModel', line: 1 },
      { kind: 'interface', label: 'Config', line: 2 },
      { kind: 'class', label: 'Runtime', line: 3 },
    ]);
  });

  it('builds nested trees for brace languages', () => {
    const items = buildOutlineFromContent(
      [
        'export class Runtime {',
        '  public boot() {',
        '    const state = {',
        '      ready: true',
        '    };',
        '  }',
        '}',
      ].join('\n'),
      'src/runtime.ts',
    );
    const tree = buildOutlineTree(items);

    expect(
      items.map((item) => ({
        label: item.label,
        kind: item.kind,
        depth: item.depth,
        endLine: item.endLine,
      })),
    ).toEqual([
      { label: 'Runtime', kind: 'class', depth: 1, endLine: 7 },
      { label: 'boot', kind: 'method', depth: 2, endLine: 7 },
      { label: 'state', kind: 'const', depth: 3, endLine: 7 },
    ]);
    expect(tree[0]?.children.map((item) => item.label)).toEqual(['boot']);
    expect(tree[0]?.children[0]?.children[0]?.label).toBe('state');
  });

  it('extracts structured outlines for yaml and vue files', () => {
    const yamlItems = buildOutlineFromContent(
      ['server:', '  http:', '    routes:', '      - path:', '          secure: true'].join('\n'),
      'config/app.yaml',
    );
    const vueItems = buildOutlineFromContent(
      [
        '<template>',
        '  <section id="hero">',
        '    <div class="panel"></div>',
        '  </section>',
        '</template>',
        '<script>',
        'export class HeroCard {',
        '  public render() {',
        '  }',
        '}',
        '</script>',
        '<style>',
        '.hero-card {',
        '  color: red;',
        '}',
        '</style>',
      ].join('\n'),
      'HeroCard.vue',
    );

    expect(yamlItems.map((item) => `${item.depth}:${item.label}`)).toEqual([
      '1:server',
      '2:http',
      '3:routes',
      '4:path',
    ]);
    expect(vueItems.map((item) => `${item.depth}:${item.label}`)).toEqual([
      '1:template',
      '2:section#hero',
      '3:div.panel',
      '1:script',
      '2:HeroCard',
      '3:render',
      '1:style',
      '2:.hero-card',
    ]);
  });

  it('extracts full shell block labels and config object keys', () => {
    const shellItems = buildOutlineFromContent(
      [
        'while [[ $# -gt 0 ]]; do',
        '  case "$1" in',
        '    --host)',
        '      shift 2',
        '      ;;',
        '  esac',
        'done',
      ].join('\n'),
      'scripts/dev.sh',
    );
    const configItems = buildOutlineFromContent(
      [
        'export default defineConfig({',
        '  server: {',
        '    host: "127.0.0.1",',
        '  },',
        '  test: {',
        '    reporters: [],',
        '  }',
        '});',
      ].join('\n'),
      'vite.config.ts',
    );

    expect(shellItems.map((item) => `${item.depth}:${item.label}`)).toEqual([
      '1:while [[ $# -gt 0 ]]; do',
      '2:case "$1" in',
    ]);
    expect(configItems.map((item) => `${item.depth}:${item.label}`)).toEqual([
      '1:server',
      '2:host',
      '1:test',
      '2:reporters',
    ]);
  });
});
