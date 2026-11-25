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
      assetProtocol?: { enable?: boolean; scope?: string[] };
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

  it('script-src 允许 WebAssembly 编译（starry-night onig.wasm），不放宽 JS eval', () => {
    const csp = security?.csp ?? '';
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? '';
    const sources = scriptSrc.split(/\s+/);
    expect(sources).toContain("'wasm-unsafe-eval'");
    expect(sources).not.toContain("'unsafe-eval'");
  });

  it('worker-src 允许同源 worker（PDF.js 打包为同源模块）', () => {
    const csp = security?.csp ?? '';
    const workerSrc = /worker-src ([^;]+)/.exec(csp)?.[1] ?? '';
    const sources = workerSrc.split(/\s+/);
    expect(sources).toContain("'self'");
  });

  it('connect-src 允许 ws/wss（adl-server 的 files-changed 与 PTY WebSocket）', () => {
    // 打包态 WebView 的 Origin 是 `http://tauri.localhost`，adl-server 在
    // `ws://127.0.0.1:<port>`；CSP 的 `http:` 源表达式不匹配 `ws:`，缺省时
    // `/ws/workspace` 与 `/pty` 全部被拦，变更/文件树/终端实时推送静默失效。
    const csp = security?.csp ?? '';
    const connectSrc = /connect-src ([^;]+)/.exec(csp)?.[1] ?? '';
    const sources = connectSrc.split(/\s+/);
    expect(sources).toContain('ws:');
    expect(sources).toContain('wss:');
  });

  it('背景素材走受控 asset 协议（scope 限于应用数据目录的 adl-backgrounds）', () => {
    // 视频背景按 data URL 持久化会拖慢解码且可能撞 localStorage 配额；
    // 改为 Rust 复制到应用数据目录 + asset 协议流式加载。scope 必须收窄到该目录。
    expect(security?.assetProtocol).toEqual({
      enable: true,
      scope: ['$APPDATA/adl-backgrounds/**'],
    });
    const csp = security?.csp ?? '';
    const imgSrc = /img-src ([^;]+)/.exec(csp)?.[1] ?? '';
    const mediaSrc = /media-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(imgSrc.split(/\s+/)).toContain('http://asset.localhost');
    expect(mediaSrc.split(/\s+/)).toContain('http://asset.localhost');
  });
});
