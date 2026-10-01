import { describe, it, expect, afterEach } from 'vitest';
import { findTerminalCanvasForHost } from '../terminalPtyRuntime';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findTerminalCanvasForHost', () => {
  it('面板与中心终端并存时按归属宿主返回对应画布，无全局歧义', () => {
    const panel = document.createElement('div');
    panel.className = 'adl-tool-panel adl-tool-panel--terminal';
    const panelCanvas = document.createElement('div');
    panelCanvas.className = 'adl-terminal-canvas';
    panel.appendChild(panelCanvas);

    const center = document.createElement('div');
    center.className = 'adl-tool-panel adl-tool-panel--terminal adl-center-terminal';
    const centerCanvas = document.createElement('div');
    centerCanvas.className = 'adl-terminal-canvas';
    center.appendChild(centerCanvas);

    document.body.append(panel, center);

    expect(findTerminalCanvasForHost('panel')).toBe(panelCanvas);
    expect(findTerminalCanvasForHost('center')).toBe(centerCanvas);
    expect(findTerminalCanvasForHost(undefined)).toBe(panelCanvas);
  });
});
