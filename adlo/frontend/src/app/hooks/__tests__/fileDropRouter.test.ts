import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forwardNativeFileDrop,
  registerNativeFileDropHandler,
  resetNativeFileDropHandlersForTest,
  routeNativeFileDrop,
} from '../fileDropRouter';

describe('fileDropRouter', () => {
  afterEach(() => resetNativeFileDropHandlersForTest());

  it('没有处理器时返回 false（回落到工作区拖放）', () => {
    expect(routeNativeFileDrop({ paths: ['C:/x.png'] })).toBe(false);
  });

  it('后注册的处理器优先，返回 true 即视为已消费', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);
    registerNativeFileDropHandler(first);
    registerNativeFileDropHandler(second);

    expect(routeNativeFileDrop({ paths: ['C:/x.png'] })).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('注销后不再参与路由', () => {
    const handler = vi.fn(() => true);
    const unregister = registerNativeFileDropHandler(handler);
    unregister();

    expect(routeNativeFileDrop({ paths: ['C:/x.png'] })).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('全部拒绝时返回 false，让后续工作区逻辑继续', () => {
    registerNativeFileDropHandler(() => false);
    registerNativeFileDropHandler(() => false);
    expect(routeNativeFileDrop({ paths: ['C:/x.txt'] })).toBe(false);
  });

  it('forwardNativeFileDrop：覆盖层消费后不得再打开工作区', () => {
    registerNativeFileDropHandler(() => true);
    const openWorkspace = vi.fn();
    forwardNativeFileDrop({ paths: ['C:/wall.png'] }, openWorkspace);
    expect(openWorkspace).not.toHaveBeenCalled();
  });

  it('forwardNativeFileDrop：未消费时只把第一条路径交给工作区', () => {
    const openWorkspace = vi.fn();
    forwardNativeFileDrop({ paths: ['C:/folder', 'C:/other'] }, openWorkspace);
    expect(openWorkspace).toHaveBeenCalledTimes(1);
    expect(openWorkspace).toHaveBeenCalledWith('C:/folder');
  });
});
