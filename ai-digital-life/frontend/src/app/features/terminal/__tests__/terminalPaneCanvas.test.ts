import { afterEach, describe, expect, it } from 'vitest';
import { findPaneCanvas } from '../terminalPtyRuntime';

function makePaneHost(paneId: string): { host: HTMLDivElement; canvas: HTMLDivElement } {
  const host = document.createElement('div');
  host.dataset.paneId = paneId;
  const canvas = document.createElement('div');
  canvas.className = 'adl-terminal-canvas';
  host.appendChild(canvas);
  return { host, canvas };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findPaneCanvas', () => {
  it('按 data-pane-id 归属返回对应窗格内的终端画布', () => {
    const one = makePaneHost('pane-1');
    const other = makePaneHost('pane-other');
    document.body.append(other.host, one.host);

    expect(findPaneCanvas('pane-1')).toBe(one.canvas);
    expect(findPaneCanvas('pane-other')).toBe(other.canvas);
  });

  it('无匹配窗格宿主时返回 null', () => {
    document.body.append(makePaneHost('pane-1').host);
    expect(findPaneCanvas('missing')).toBeNull();
  });
});
