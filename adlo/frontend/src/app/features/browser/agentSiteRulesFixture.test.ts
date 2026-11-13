import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultAgentSiteRules } from '@shared/agentSiteRules';

/**
 * 真实夹具 × 真实 init_script.js：把 `agent-site-rules-fixture/index.html`
 * 的 body 原样载入当前 jsdom，按页面上的真实元素点击，断言最终的
 * adl-agent-link 载荷。这是「点击 → 规则匹配 → postMessage」链路的功能回归；
 * Rust 侧解析与 `useBrowserAgentLinkSubscription` 的打开动作由各自单测覆盖。
 */
const INIT_SCRIPT = readFileSync(
  resolve(process.cwd(), '../crates/browser/src/init_script.js'),
  'utf8',
);
const FIXTURE_HTML = readFileSync(
  resolve(process.cwd(), 'prototype/agent-site-rules-fixture/index.html'),
  'utf8',
);
const FIXTURE_BODY = /<body[^>]*>([\s\S]*)<\/body>/i.exec(FIXTURE_HTML)?.[1] ?? '';

// 产品默认规则直接取真源，避免手抄子集（漏 data-src 等属性会让负向用例空跑）。
const DEFAULT_RULES = [
  ...defaultAgentSiteRules(),
  {
    id: 'custom-docs-regex',
    enabled: true,
    matchSelector: 'button',
    attributes: ['data-href'],
    pathPreset: 'regex',
    valueRegex: '^/docs/',
    action: 'url',
  },
];

interface Captured {
  type?: string;
  kind?: 'url' | 'file';
  url?: string;
}

let posted: Captured[] = [];

beforeAll(() => {
  document.body.innerHTML = FIXTURE_BODY;
  const window = globalThis as unknown as Record<string, unknown> & {
    chrome: unknown;
    __adlAgentOrigins: string[];
    __adlAgentInterceptEnabled: boolean;
    __adlAgentRules: unknown;
    __adlAgentOverridesByOrigin: unknown;
  };
  window.chrome = {
    webview: {
      postMessage: (raw: string) => {
        try {
          posted.push(JSON.parse(raw) as Captured);
        } catch {
          /* ignore non-JSON */
        }
      },
    },
  };
  window.__adlAgentOrigins = [globalThis.location.origin];
  window.__adlAgentInterceptEnabled = true;
  window.__adlAgentRules = DEFAULT_RULES;
  window.__adlAgentOverridesByOrigin = [];
  try {
    // 与 WebView2 注入方式一致：init_script.js 在页面脚本之前执行。
    new Function(INIT_SCRIPT)();
  } catch {
    /* jsdom 可能缺少 WebView2-only API；点击监听器已在脚本前半段注册 */
  }
});

beforeEach(() => {
  posted = [];
});

function clickItem(text: string): void {
  const element = Array.from(document.querySelectorAll<HTMLElement>('.fixture__item')).find(
    (entry) => (entry.textContent ?? '').includes(text),
  );
  if (!element) {
    throw new Error(`fixture item not found: ${text}`);
  }
  element.click();
}

function agentLinks(): Captured[] {
  return posted.filter((entry) => entry.type === 'adl-agent-link');
}

describe('agent-site rules · real fixture', () => {
  it('intercepts a local markdown anchor as kind=file', () => {
    clickItem('本地 markdown');
    const links = agentLinks();
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe('file');
    expect(links[0].url).toMatch(/\/sample\.md$/);
  });

  it('intercepts a local audio anchor as kind=file', () => {
    clickItem('本地音频');
    const links = agentLinks();
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe('file');
    expect(links[0].url).toMatch(/Alarm01\.wav$/);
  });

  it('intercepts a normal website anchor as kind=url', () => {
    clickItem('普通网站链接');
    expect(agentLinks()).toEqual([
      { type: 'adl-agent-link', kind: 'url', url: 'https://example.com/' },
    ]);
  });

  it('intercepts a button with a local data-file-path attribute', () => {
    clickItem('data-file-path 属性');
    const links = agentLinks();
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe('file');
    expect(links[0].url).toMatch(/sample\.json$/);
  });

  it('intercepts a title attribute local path', () => {
    clickItem('title 属性');
    const links = agentLinks();
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe('file');
    expect(links[0].url).toMatch(/sample\.md$/);
  });

  it('does not treat a site-relative data-src as a local file', () => {
    clickItem('站点相对路径（负向）');
    expect(agentLinks()).toHaveLength(0);
  });

  it('resolves a relative url regex match against the page', () => {
    clickItem('相对网址（正则）');
    expect(agentLinks()).toEqual([
      {
        type: 'adl-agent-link',
        kind: 'url',
        url: `${window.location.origin}/docs/guide.md`,
      },
    ]);
  });

  it('leaves mailto and ordinary buttons alone', () => {
    clickItem('mailto');
    clickItem('普通按钮');
    expect(agentLinks()).toHaveLength(0);
  });
});
