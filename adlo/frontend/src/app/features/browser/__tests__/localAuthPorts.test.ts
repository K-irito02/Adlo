import { describe, it, expect } from 'vitest';
import {
  AUTH_REQUIRED_LOCAL_PORTS,
  OPENER_BY_PORT,
  getAuthRequiredPort,
  isLoopbackHostname,
  routeLocalUrl,
} from '../browser-landing/localAuthPorts';

describe('isLoopbackHostname', () => {
  it.each([
    ['localhost', true],
    ['LOCALHOST', true],
    ['127.0.0.1', true],
    ['127.0.0.2', true],
    ['::1', true],
    // URL.hostname 对 IPv6 保留方括号，两种形态都要认。
    ['[::1]', true],
    ['192.168.1.10', false],
    ['example.com', false],
    ['', false],
  ])('%s -> %s', (host, expected) => {
    expect(isLoopbackHostname(host)).toBe(expected);
  });
});

describe('getAuthRequiredPort', () => {
  it('dsh 3080 loopback 返回端口号', () => {
    expect(getAuthRequiredPort('http://127.0.0.1:3080')).toBe(3080);
    expect(getAuthRequiredPort('http://localhost:3080/?token=abc')).toBe(3080);
    expect(getAuthRequiredPort('http://[::1]:3080')).toBe(3080);
    expect(getAuthRequiredPort('HTTP://LOCALHOST:3080')).toBe(3080);
    expect(getAuthRequiredPort('https://127.0.0.1:3080')).toBe(3080);
  });

  it('非集合端口 / 非 loopback / 非法 URL 返回 null', () => {
    expect(getAuthRequiredPort('http://127.0.0.1:5173')).toBeNull();
    expect(getAuthRequiredPort('http://192.168.1.10:3080')).toBeNull();
    expect(getAuthRequiredPort('not a url')).toBeNull();
    expect(getAuthRequiredPort('')).toBeNull();
    expect(getAuthRequiredPort('file:///tmp/x')).toBeNull();
    expect(getAuthRequiredPort('ws://127.0.0.1:3080')).toBeNull();
  });

  it('缺端口（默认端口被归一化省略）返回 null，不依赖 Number("") 巧合', () => {
    expect(getAuthRequiredPort('http://127.0.0.1')).toBeNull();
    expect(getAuthRequiredPort('http://localhost')).toBeNull();
  });

  it('集合即当前已知需认证端口（扩展点：未来站点追加）', () => {
    expect(AUTH_REQUIRED_LOCAL_PORTS.has(3080)).toBe(true);
  });
});

describe('routeLocalUrl', () => {
  it('loopback 3080 分发到 dsh opener（http/https 均可）', () => {
    expect(routeLocalUrl('http://127.0.0.1:3080')).toEqual({ opener: 'dsh' });
    expect(routeLocalUrl('http://127.0.0.1:3080/?token=abc')).toEqual({ opener: 'dsh' });
    expect(routeLocalUrl('https://127.0.0.1:3080')).toEqual({ opener: 'dsh' });
  });

  it('未映射端口回退 null（调用方裸开），不静默进 dsh', () => {
    expect(routeLocalUrl('http://127.0.0.1:5173')).toBeNull();
    expect(routeLocalUrl('http://192.168.1.10:3080')).toBeNull();
    expect(routeLocalUrl('not a url')).toBeNull();
    expect(routeLocalUrl('https://127.0.0.1:8080')).toBeNull();
  });

  it('分发表与集合同源（OPENER_BY_PORT 键即集合成员）', () => {
    expect(new Set(OPENER_BY_PORT.keys())).toEqual(AUTH_REQUIRED_LOCAL_PORTS);
  });
});
