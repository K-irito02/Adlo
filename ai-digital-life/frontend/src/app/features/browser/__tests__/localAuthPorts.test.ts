import { describe, it, expect } from 'vitest';
import {
  AUTH_REQUIRED_LOCAL_PORTS,
  getAuthRequiredPort,
  isLoopbackHostname,
} from '../browser-landing/localAuthPorts';

describe('isLoopbackHostname', () => {
  it.each([
    ['localhost', true],
    ['LOCALHOST', true],
    ['127.0.0.1', true],
    ['127.0.0.2', true],
    ['::1', true],
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
  });

  it('非集合端口 / 非 loopback / 非法 URL 返回 null', () => {
    expect(getAuthRequiredPort('http://127.0.0.1:5173')).toBeNull();
    expect(getAuthRequiredPort('http://192.168.1.10:3080')).toBeNull();
    expect(getAuthRequiredPort('not a url')).toBeNull();
    expect(getAuthRequiredPort('file:///tmp/x')).toBeNull();
  });

  it('集合即当前已知需认证端口（扩展点：未来站点追加）', () => {
    expect(AUTH_REQUIRED_LOCAL_PORTS.has(3080)).toBe(true);
  });
});
