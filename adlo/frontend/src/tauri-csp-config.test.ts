// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 打包版（Tauri 生产环境）样式注入契约。
 *
 * CodeMirror 的结构/主题 CSS 由 `style-mod` 在运行时注入 `<style>`；构建产物 `index.html`
 * 自带内联 `<style>`，Tauri 默认会给 `style-src` 追加 `'nonce-…'`，而按 CSP3 一旦出现
 * nonce/hash，`'unsafe-inline'` 即被忽略 → 运行时注入的样式全部被拦（变更面板差异视图
 * 行号跑到最右、变更块变整宽色条；Markdown 预览主题同样失效）。dev 走 Vite 不注入该 CSP，
 * 因此只在打包版复现。
 *
 * 修复：只停用 Tauri 对 `style-src` 的 nonce/hash 注入，保留 `script-src` 的加固。
 */
const conf = JSON.parse(
  readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf-8'),
) as {
  app?: {
    security?: {
      csp?: string;
      dangerousDisableAssetCspModification?: boolean | string[];
    };
  };
};

describe('Tauri CSP 与运行时样式注入', () => {
  const security = conf.app?.security;

  it('style-src 保留 unsafe-inline 且不叠加 nonce（否则 CodeMirror 样式被拦）', () => {
    expect(security?.csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(security?.dangerousDisableAssetCspModification).toEqual(['style-src']);
  });

  it('script-src 的资产加固不被关闭', () => {
    const disabled = security?.dangerousDisableAssetCspModification;
    const directives = Array.isArray(disabled) ? disabled : [];
    expect(directives).not.toContain('script-src');
  });

  it('img-src/media-src 允许 blob:（Office 内嵌媒体与 object URL 兜底）', () => {
    // 事项 8：打包态曾因缺 `blob:` 把 `<img>/<audio>/<video>` 的 object URL 全部拦掉，
    // 用户看到「当前环境无法解码或播放该文件」（dev 无 CSP，故不复现）。
    const csp = security?.csp ?? '';
    const imgSrc = /img-src ([^;]+)/.exec(csp)?.[1] ?? '';
    const mediaSrc = /media-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(imgSrc.split(/\s+/)).toContain('blob:');
    expect(mediaSrc.split(/\s+/)).toContain('blob:');
  });
});
