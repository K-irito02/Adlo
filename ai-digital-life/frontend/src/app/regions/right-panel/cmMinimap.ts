import { ViewPlugin, type PluginValue, EditorView, ViewUpdate } from "@codemirror/view";
import { type Extension, StateField, StateEffect } from "@codemirror/state";
import type { AgentHunkDecoration } from "./agentDecorations";

export interface MinimapSettings {
  renderCharacters: boolean;
  thumbnailSize: number;
  zoomLevel: number;
  sliderBehavior: "proportional" | "fixed";
  sliderProminence: "subtle" | "normal" | "bold";
}

const DEFAULT_MINIMAP_SETTINGS: MinimapSettings = {
  renderCharacters: false,
  thumbnailSize: 80,
  zoomLevel: 1,
  sliderBehavior: "proportional",
  sliderProminence: "normal",
};

const STORAGE_KEY = "adl-minimap-settings";

export function loadMinimapSettings(): MinimapSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_MINIMAP_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_MINIMAP_SETTINGS };
}

export function saveMinimapSettings(settings: MinimapSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export const setMinimapDiffHunks = StateEffect.define<AgentHunkDecoration[]>();

const minimapDiffHunksField = StateField.define<AgentHunkDecoration[]>({
  create: () => [],
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setMinimapDiffHunks)) return effect.value;
    }
    return value;
  },
});

class MinimapPlugin implements PluginValue {
  private dom: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private slider: HTMLElement;
  private settings: MinimapSettings;
  private isDragging = false;
  private dragStartY = 0;
  private dragStartScrollTop = 0;
  private hunks: AgentHunkDecoration[] = [];

  constructor(private view: EditorView) {
    this.settings = loadMinimapSettings();

    this.dom = document.createElement("div");
    this.dom.className = "adl-cm-minimap";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "adl-cm-minimap-canvas";
    this.dom.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.slider = document.createElement("div");
    this.slider.className = "adl-cm-minimap-slider";
    this.dom.appendChild(this.slider);

    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);

    this.hunks = view.state.field(minimapDiffHunksField, false) ?? [];
    this.render();
    this.updateSlider();

    view.dom.appendChild(this.dom);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.hunks = update.state.field(minimapDiffHunksField, false) ?? [];
      this.render();
      this.updateSlider();
    }
    if (update.transactions.some(tr => tr.effects.some(e => e.is(setMinimapDiffHunks)))) {
      this.hunks = update.state.field(minimapDiffHunksField, false) ?? [];
      this.render();
    }
  }

  destroy() {
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    this.dom.remove();
  }

  private render() {
    const lineCount = this.view.state.doc.lines;
    const width = this.settings.thumbnailSize;
    const lineHeight = 2;
    const height = Math.max(lineCount * lineHeight, 1);

    this.canvas.width = width;
    this.canvas.height = height;
    this.dom.style.width = `${width}px`;

    this.ctx.clearRect(0, 0, width, height);

    const fgColor = getComputedStyle(this.view.dom).color || "#d4d4d4";
    const insertColor = "rgba(22,163,74,0.4)";
    const deleteColor = "rgba(239,68,68,0.4)";

    const diffLineSet = new Map<number, "added" | "deleted" | "modified">();
    for (const hunk of this.hunks) {
      for (let line = hunk.startLine; line <= hunk.endLine; line++) {
        diffLineSet.set(line, hunk.changeKind);
      }
    }

    for (let i = 1; i <= lineCount; i++) {
      const line = this.view.state.doc.line(i);
      const y = (i - 1) * lineHeight;
      const diffKind = diffLineSet.get(i);

      if (diffKind === "added" || diffKind === "modified") {
        this.ctx.fillStyle = insertColor;
      } else if (diffKind === "deleted") {
        this.ctx.fillStyle = deleteColor;
      } else {
        this.ctx.fillStyle = fgColor;
      }

      const charWidth = width / 80;
      const linePixelWidth = Math.min(line.length * charWidth, width);
      this.ctx.fillRect(0, y, linePixelWidth, lineHeight - 1);
    }
  }

  private updateSlider() {
    const scrollDom = this.view.scrollDOM;
    const scrollTop = scrollDom.scrollTop;
    const scrollHeight = scrollDom.scrollHeight;
    const clientHeight = scrollDom.clientHeight;
    const canvasHeight = this.canvas.height;

    if (scrollHeight <= clientHeight) {
      this.slider.style.display = "none";
      return;
    }

    this.slider.style.display = "";
    const ratio = canvasHeight / scrollHeight;
    const sliderTop = scrollTop * ratio;
    const sliderHeight = Math.max(clientHeight * ratio, 20);

    this.slider.style.top = `${sliderTop}px`;
    this.slider.style.height = `${sliderHeight}px`;
  }

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      this.isDragging = true;
      this.dragStartY = e.clientY;
      this.dragStartScrollTop = this.view.scrollDOM.scrollTop;
      this.scrollToPosition(e.offsetY);
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    this.scrollToPosition(offsetY);
  };

  private handleMouseUp = () => {
    this.isDragging = false;
  };

  private scrollToPosition(offsetY: number) {
    const scrollDom = this.view.scrollDOM;
    const scrollHeight = scrollDom.scrollHeight;
    const canvasHeight = this.canvas.height;
    if (canvasHeight === 0) return;
    const ratio = scrollHeight / canvasHeight;
    const targetScrollTop = offsetY * ratio - scrollDom.clientHeight / 2;
    scrollDom.scrollTop = Math.max(0, Math.min(targetScrollTop, scrollHeight - scrollDom.clientHeight));
  }

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const menu = document.createElement("div");
    menu.className = "adl-cm-minimap-context-menu";

    const settings = this.settings;

    const items: Array<{ label: string; checked: boolean; onClick: () => void }> = [
      {
        label: "渲染字符",
        checked: settings.renderCharacters,
        onClick: () => { settings.renderCharacters = !settings.renderCharacters; this.applySettings(); },
      },
      {
        label: "滑块: 按比例",
        checked: settings.sliderBehavior === "proportional",
        onClick: () => { settings.sliderBehavior = "proportional"; this.applySettings(); },
      },
      {
        label: "滑块: 固定",
        checked: settings.sliderBehavior === "fixed",
        onClick: () => { settings.sliderBehavior = "fixed"; this.applySettings(); },
      },
    ];

    for (const item of items) {
      const el = document.createElement("div");
      el.className = `adl-cm-minimap-menu-item${item.checked ? " adl-cm-minimap-menu-item--checked" : ""}`;
      el.textContent = item.label;
      el.addEventListener("click", () => {
        item.onClick();
        menu.remove();
      });
      menu.appendChild(el);
    }

    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    document.body.appendChild(menu);

    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 0);
  }

  private applySettings() {
    saveMinimapSettings(this.settings);
    this.render();
    this.updateSlider();
  }
}

export function getMinimapExtension(): Extension[] {
  return [
    minimapDiffHunksField,
    ViewPlugin.define((view) => new MinimapPlugin(view)),
  ];
}

export function updateMinimapDiffHunks(view: EditorView, hunks: AgentHunkDecoration[]) {
  view.dispatch({ effects: setMinimapDiffHunks.of(hunks) });
}
