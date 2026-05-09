import { ViewPlugin, type PluginValue, EditorView, ViewUpdate } from "@codemirror/view";
import { type Extension, StateField, StateEffect } from "@codemirror/state";
import type { AgentHunkDecoration } from "./agentDecorations";
import type { PreviewDiffVisualRange, PreviewDiffVisualTone } from "./changePreviewDiffRanges";

export interface MinimapSettings {
  renderCharacters: boolean;
  thumbnailSize: number;
  zoomLevel: number;
  sliderBehavior: "proportional" | "fixed";
  sliderProminence: "subtle" | "normal" | "bold";
  scrollbarType: "minimap" | "native";
  isGlobal: boolean;
}

const DEFAULT_MINIMAP_SETTINGS: MinimapSettings = {
  renderCharacters: false,
  thumbnailSize: 80,
  zoomLevel: 1,
  sliderBehavior: "proportional",
  sliderProminence: "normal",
  scrollbarType: "minimap",
  isGlobal: true,
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
export const setMinimapDiffModel = StateEffect.define<CmMinimapDiffModel | null>();

export type CmMinimapDiffRange = PreviewDiffVisualRange;

export type CmMinimapDiffModel = {
  ranges: CmMinimapDiffRange[];
  totalLines: number;
  lineColumns?: number[];
};

export type CmMinimapDiffSegment = {
  type: "insert" | "delete";
  tone: PreviewDiffVisualTone;
  contentColumns: number;
  lane: number;
  laneCount: number;
};

export type CmMinimapExtensionOptions = {
  onDragStart?: () => void;
};

export type MinimapSliderMetricsInput = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
  minHeight?: number;
};

export type MinimapSliderMetrics = {
  visible: boolean;
  top: number;
  height: number;
};

export type MinimapDragInput = {
  pointerY: number;
  trackTop: number;
  dragOffsetY: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
  sliderHeight: number;
};

export type MinimapRenderMetricsInput = {
  lineCount: number;
  containerHeight: number;
  maxLineHeight?: number;
};

export type MinimapRenderMetrics = {
  renderHeight: number;
  lineHeight: number;
};

const DIFF_SEGMENT_ORDER: Record<CmMinimapDiffSegment["type"], number> = {
  delete: 0,
  insert: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function computeMinimapSliderMetrics(input: MinimapSliderMetricsInput): MinimapSliderMetrics {
  const minHeight = input.minHeight ?? 20;
  const scrollHeight = Math.max(input.scrollHeight, 0);
  const clientHeight = Math.max(input.clientHeight, 0);
  const trackHeight = Math.max(input.trackHeight, 0);
  if (scrollHeight <= clientHeight || clientHeight <= 0 || trackHeight <= 0) {
    return { visible: false, top: 0, height: 0 };
  }

  const maxScrollTop = scrollHeight - clientHeight;
  const rawHeight = (clientHeight / scrollHeight) * trackHeight;
  const height = clamp(rawHeight, Math.min(minHeight, trackHeight), trackHeight);
  const maxTop = Math.max(0, trackHeight - height);
  const top = maxScrollTop <= 0 ? 0 : (clamp(input.scrollTop, 0, maxScrollTop) / maxScrollTop) * maxTop;
  return {
    visible: true,
    top,
    height,
  };
}

export function computeMinimapScrollTopFromPointer(input: MinimapDragInput): number {
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
  const trackTravel = Math.max(1, input.trackHeight - input.sliderHeight);
  const sliderTop = clamp(input.pointerY - input.trackTop - input.dragOffsetY, 0, trackTravel);
  return (sliderTop / trackTravel) * maxScrollTop;
}

export function computeMinimapRenderMetrics(input: MinimapRenderMetricsInput): MinimapRenderMetrics {
  const lineCount = Math.max(1, input.lineCount);
  const containerHeight = Math.max(1, input.containerHeight);
  const maxLineHeight = input.maxLineHeight ?? 2;
  const lineHeight = Math.min(containerHeight / lineCount, maxLineHeight);
  return {
    lineHeight,
    renderHeight: Math.min(containerHeight, lineCount * lineHeight),
  };
}

export function getMinimapDiffSegmentsForLine(model: CmMinimapDiffModel | null | undefined, line: number): CmMinimapDiffSegment[] {
  if (!model || line < 1) return [];
  const segments = model.ranges
    .filter((range) => range.startLine <= line && range.endLine >= line)
    .map<CmMinimapDiffSegment>((range) => ({
      type: range.type,
      tone: range.tone,
      contentColumns: range.contentColumns,
      lane: 0,
      laneCount: 1,
    }))
    .sort((a, b) => DIFF_SEGMENT_ORDER[a.type] - DIFF_SEGMENT_ORDER[b.type]);

  const laneCount = segments.length;
  return segments.map((segment, lane) => ({
    ...segment,
    lane,
    laneCount,
  }));
}

export function minimapHunksToDiffModel(hunks: AgentHunkDecoration[], totalLines: number): CmMinimapDiffModel {
  return {
    totalLines,
    lineColumns: undefined,
    ranges: hunks.flatMap((hunk): CmMinimapDiffRange[] => {
      const startLine = Math.max(1, hunk.startLine);
      const endLine = Math.max(startLine, hunk.endLine);
      if (hunk.changeKind === "added") {
        return [{ startLine, endLine, type: "insert", tone: "base", contentColumns: 1 }];
      }
      if (hunk.changeKind === "deleted") {
        return [{ startLine, endLine, type: "delete", tone: "base", contentColumns: 1 }];
      }
      return [
        { startLine, endLine, type: "insert", tone: "strong", contentColumns: 1 },
        { startLine, endLine, type: "delete", tone: "strong", contentColumns: 1 },
      ];
    }),
  };
}

const minimapDiffModelField = StateField.define<CmMinimapDiffModel | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setMinimapDiffModel)) return effect.value;
      if (effect.is(setMinimapDiffHunks)) return minimapHunksToDiffModel(effect.value, tr.state.doc.lines);
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
  private dragOffsetY = 0;
  private frame = 0;
  private pendingScrollLine: number | null = null;
  private diffModel: CmMinimapDiffModel | null = null;
  private host: HTMLElement;
  private notifyDragAfterRelease = false;
  private handleWheel: (e: WheelEvent) => void;

  constructor(private view: EditorView, private options: CmMinimapExtensionOptions = {}) {
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

    this.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.slider.addEventListener("pointerdown", this.handleSliderPointerDown);
    this.view.scrollDOM.addEventListener("scroll", this.handleEditorScroll, { passive: true });

    this.handleWheel = (e: WheelEvent) => {
      const scrollDom = this.view.scrollDOM;
      scrollDom.scrollTop += e.deltaY;
      e.preventDefault();
    };
    this.dom.addEventListener("wheel", this.handleWheel, { passive: false });

    this.host = view.dom;
    this.attachToHost();
    requestAnimationFrame(() => {
      this.attachToHost();
      this.render();
      this.updateSlider();
    });

    this.diffModel = view.state.field(minimapDiffModelField, false) ?? null;
    this.updateScrollbarStyle();
  }

  update(update: ViewUpdate) {
    this.attachToHost();
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.diffModel = update.state.field(minimapDiffModelField, false) ?? null;
      this.scheduleRender();
    }
    if (update.transactions.some(tr => tr.effects.some(e => e.is(setMinimapDiffModel) || e.is(setMinimapDiffHunks)))) {
      this.diffModel = update.state.field(minimapDiffModelField, false) ?? null;
      this.scheduleRender();
    }
  }

  private scheduleRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
      this.updateSlider();
    });
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.handleCanvasPointerDown);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.slider.removeEventListener("pointerdown", this.handleSliderPointerDown);
    this.view.scrollDOM.removeEventListener("scroll", this.handleEditorScroll);
    this.dom.removeEventListener("wheel", this.handleWheel);
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.host.style.removeProperty("--adl-editor-minimap-width");
    this.dom.remove();
  }

  private findSurfaceHost(): HTMLElement | null {
    let el: HTMLElement | null = this.view.dom;
    while (el) {
      if (el.classList.contains("adl-tool-editor__surface")) return el;
      el = el.parentElement;
    }
    return null;
  }

  private attachToHost() {
    const nextHost = this.findSurfaceHost() ?? this.view.dom;
    if (nextHost === this.host && this.dom.parentElement === nextHost) {
      return;
    }
    this.host.style.removeProperty("--adl-editor-minimap-width");
    this.host = nextHost;
    this.host.appendChild(this.dom);
    this.host.style.setProperty("--adl-editor-minimap-width", `${this.settings.thumbnailSize}px`);
  }

  private getEffectiveLineCount(): number {
    const diffModel = this.diffModel;
    const hasDiffRanges = diffModel && diffModel.ranges.length > 0;
    if (hasDiffRanges && diffModel.lineColumns && diffModel.lineColumns.length > 0) {
      return diffModel.lineColumns.length;
    }
    if (hasDiffRanges && diffModel.totalLines > 0) {
      return diffModel.totalLines;
    }
    return this.view.state.doc.lines;
  }

  private render() {
    const docLineCount = this.view.state.doc.lines;
    const diffModel = this.diffModel;
    const hasDiffRanges = diffModel && diffModel.ranges.length > 0;

    let lineCount: number;
    let useDocLines: boolean;

    if (hasDiffRanges && diffModel.lineColumns && diffModel.lineColumns.length > 0) {
      lineCount = diffModel.lineColumns.length;
      useDocLines = false;
    } else if (hasDiffRanges && diffModel.totalLines > 0) {
      lineCount = diffModel.totalLines;
      useDocLines = false;
    } else {
      lineCount = docLineCount;
      useDocLines = true;
    }
    lineCount = Math.max(1, lineCount);

    const width = this.settings.thumbnailSize;
    const height = Math.max(this.dom.clientHeight || this.view.scrollDOM.clientHeight || 1, 1);
    const dpr = window.devicePixelRatio || 1;
    const renderMetrics = computeMinimapRenderMetrics({
      lineCount,
      containerHeight: height,
      maxLineHeight: 2 * this.settings.zoomLevel,
    });

    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.dom.style.width = `${width}px`;
    this.dom.style.setProperty("--adl-cm-minimap-width", `${width}px`);
    this.host.style.setProperty("--adl-editor-minimap-width", `${width}px`);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.ctx.clearRect(0, 0, width, height);

    const computedStyle = getComputedStyle(this.view.dom);
    const fgColor = computedStyle.color || "rgba(148, 163, 184, 0.45)";

    const charWidth = width / 80;

    for (let i = 1; i <= lineCount; i++) {
      const y = (i - 1) * renderMetrics.lineHeight;
      const lineHeight = renderMetrics.lineHeight;
      this.ctx.fillStyle = fgColor;

      const lineColumnsValue = useDocLines && i <= docLineCount
        ? this.view.state.doc.line(i).length
        : diffModel?.lineColumns?.[i - 1] ?? 0;
      const linePixelWidth = Math.min(lineColumnsValue * charWidth, width);
      if (linePixelWidth > 0) {
        this.ctx.fillRect(0, y, linePixelWidth, Math.max(1, lineHeight * 0.65));
      }

      const segments = getMinimapDiffSegmentsForLine(diffModel, i);
      for (const segment of segments) {
        this.ctx.fillStyle = this.getSegmentColor(segment);
        const laneWidth = width / Math.max(1, segment.laneCount);
        const x = segment.lane * laneWidth;
        const contentWidth = Math.max(3, Math.min(segment.contentColumns * charWidth, laneWidth));
        this.ctx.fillRect(x, y, contentWidth, Math.max(1, lineHeight));
      }
    }
  }

  private updateSlider() {
    const lineCount = Math.max(1, this.getEffectiveLineCount());
    const containerHeight = Math.max(1, this.dom.clientHeight || this.view.scrollDOM.clientHeight);

    const viewport = this.view.viewport;
    const docLines = this.view.state.doc.lines;
    const firstLine = docLines > 0
      ? this.view.state.doc.lineAt(Math.min(viewport.from, this.view.state.doc.length)).number
      : 1;
    const lastLine = docLines > 0
      ? this.view.state.doc.lineAt(Math.min(viewport.to, this.view.state.doc.length)).number
      : 1;
    const visibleLineCount = Math.max(1, lastLine - firstLine + 1);

    const sliderMinHeight = 20;
    const rawSliderHeight = (visibleLineCount / lineCount) * containerHeight;
    const sliderHeight = clamp(rawSliderHeight, Math.min(sliderMinHeight, containerHeight), containerHeight);
    const maxSliderTop = Math.max(0, containerHeight - sliderHeight);
    const sliderTop = lineCount <= visibleLineCount
      ? 0
      : ((firstLine - 1) / (lineCount - visibleLineCount)) * maxSliderTop;

    if (lineCount <= visibleLineCount && containerHeight > 0) {
      this.slider.style.display = "";
      this.slider.style.top = "0px";
      this.slider.style.height = `${containerHeight}px`;
      return;
    }

    if (containerHeight <= 0) {
      this.slider.style.display = "none";
      return;
    }

    this.slider.style.display = "";
    this.slider.style.top = `${sliderTop}px`;
    this.slider.style.height = `${sliderHeight}px`;
  }

  private handleCanvasPointerDown = (e: PointerEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      this.notifyDragAfterRelease = true;
      this.isDragging = true;
      const sliderRect = this.slider.getBoundingClientRect();
      this.dragOffsetY = sliderRect.height / 2;
      this.dom.setPointerCapture(e.pointerId);
      this.dom.addEventListener("pointermove", this.handlePointerMove);
      this.dom.addEventListener("pointerup", this.handlePointerUp);
      this.dom.addEventListener("pointercancel", this.handlePointerUp);
      this.scrollToPointer(e.clientY);
    }
  };

  private handleSliderPointerDown = (e: PointerEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      this.notifyDragAfterRelease = true;
      this.isDragging = true;
      const sliderRect = this.slider.getBoundingClientRect();
      this.dragOffsetY = clamp(e.clientY - sliderRect.top, 0, sliderRect.height);
      this.slider.setPointerCapture(e.pointerId);
      this.slider.addEventListener("pointermove", this.handlePointerMove);
      this.slider.addEventListener("pointerup", this.handlePointerUp);
      this.slider.addEventListener("pointercancel", this.handlePointerUp);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    e.preventDefault();
    this.scrollToPointer(e.clientY);
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.isDragging = false;
    if (this.dom.hasPointerCapture(e.pointerId)) {
      this.dom.releasePointerCapture(e.pointerId);
    }
    if (this.slider.hasPointerCapture(e.pointerId)) {
      this.slider.releasePointerCapture(e.pointerId);
    }
    this.dom.removeEventListener("pointermove", this.handlePointerMove);
    this.dom.removeEventListener("pointerup", this.handlePointerUp);
    this.dom.removeEventListener("pointercancel", this.handlePointerUp);
    this.slider.removeEventListener("pointermove", this.handlePointerMove);
    this.slider.removeEventListener("pointerup", this.handlePointerUp);
    this.slider.removeEventListener("pointercancel", this.handlePointerUp);
    if (this.notifyDragAfterRelease) {
      this.notifyDragAfterRelease = false;
      this.options.onDragStart?.();
    }
  };

  private scrollToPointer(pointerY: number) {
    const lineCount = Math.max(1, this.getEffectiveLineCount());
    const containerHeight = Math.max(1, this.dom.clientHeight || this.view.scrollDOM.clientHeight);

    const viewport = this.view.viewport;
    const docLines = this.view.state.doc.lines;
    const firstLine = docLines > 0
      ? this.view.state.doc.lineAt(Math.min(viewport.from, this.view.state.doc.length)).number
      : 1;
    const lastLine = docLines > 0
      ? this.view.state.doc.lineAt(Math.min(viewport.to, this.view.state.doc.length)).number
      : 1;
    const visibleLineCount = Math.max(1, lastLine - firstLine + 1);

    const sliderMinHeight = 20;
    const rawSliderHeight = (visibleLineCount / lineCount) * containerHeight;
    const sliderHeight = clamp(rawSliderHeight, Math.min(sliderMinHeight, containerHeight), containerHeight);

    const rect = this.dom.getBoundingClientRect();
    const trackTravel = Math.max(1, containerHeight - sliderHeight);
    const sliderTop = clamp(pointerY - rect.top - this.dragOffsetY, 0, trackTravel);
    const ratio = sliderTop / trackTravel;
    const targetLine = Math.max(1, Math.min(lineCount, Math.round(ratio * (lineCount - visibleLineCount + 1)) + 1));

    this.pendingScrollLine = targetLine;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.pendingScrollLine === null) return;
      const line = this.pendingScrollLine;
      this.pendingScrollLine = null;
      if (line <= this.view.state.doc.lines) {
        const pos = this.view.state.doc.line(line).from;
        this.view.dispatch({
          effects: EditorView.scrollIntoView(pos, { y: "start" }),
        });
      }
      this.updateSlider();
    });
  }

  private updateScrollbarStyle() {
    const scrollDom = this.view.scrollDOM;
    if (this.settings.scrollbarType === "minimap") {
      this.dom.style.display = "";
      scrollDom.classList.add("adl-cm-scroller--minimap-scrollbar");
    } else {
      this.dom.style.display = "none";
      scrollDom.classList.remove("adl-cm-scroller--minimap-scrollbar");
    }
  }

  private handleEditorScroll = () => {
    this.updateSlider();
  };

  private getSegmentColor(segment: CmMinimapDiffSegment): string {
    const computedStyle = getComputedStyle(this.view.dom);
    const suffix = segment.tone === "strong"
      ? "-strong"
      : segment.tone === "block"
        ? "-block"
        : "";
    const fallback = segment.type === "insert"
      ? "rgba(22,163,74,0.42)"
      : "rgba(239,68,68,0.42)";
    const baseName = segment.type === "insert"
      ? `--minimap-diff-insert-bg${suffix}`
      : `--minimap-diff-remove-bg${suffix}`;
    return computedStyle.getPropertyValue(baseName).trim()
      || computedStyle.getPropertyValue(segment.type === "insert" ? "--minimap-diff-insert-bg" : "--minimap-diff-remove-bg").trim()
      || fallback;
  }

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const menu = document.createElement("div");
    menu.className = "adl-cm-minimap-context-menu";

    const settings = this.settings;

    const items: Array<{ label: string; checked: boolean; onClick: () => void; separator?: boolean }> = [
      {
        label: "滑动条: Minimap",
        checked: settings.scrollbarType === "minimap",
        onClick: () => { settings.scrollbarType = "minimap"; this.applySettings(); },
      },
      {
        label: "滑动条: 原生",
        checked: settings.scrollbarType === "native",
        onClick: () => { settings.scrollbarType = "native"; this.applySettings(); },
      },
      {
        label: "",
        checked: false,
        onClick: () => {},
        separator: true,
      },
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
      {
        label: "",
        checked: false,
        onClick: () => {},
        separator: true,
      },
      {
        label: "缩放: 50%",
        checked: settings.zoomLevel === 0.5,
        onClick: () => { settings.zoomLevel = 0.5; this.applySettings(); },
      },
      {
        label: "缩放: 100%",
        checked: settings.zoomLevel === 1,
        onClick: () => { settings.zoomLevel = 1; this.applySettings(); },
      },
      {
        label: "缩放: 150%",
        checked: settings.zoomLevel === 1.5,
        onClick: () => { settings.zoomLevel = 1.5; this.applySettings(); },
      },
      {
        label: "缩放: 200%",
        checked: settings.zoomLevel === 2,
        onClick: () => { settings.zoomLevel = 2; this.applySettings(); },
      },
      {
        label: "",
        checked: false,
        onClick: () => {},
        separator: true,
      },
      {
        label: "宽度: 60px",
        checked: settings.thumbnailSize === 60,
        onClick: () => { settings.thumbnailSize = 60; this.applySettings(); },
      },
      {
        label: "宽度: 80px",
        checked: settings.thumbnailSize === 80,
        onClick: () => { settings.thumbnailSize = 80; this.applySettings(); },
      },
      {
        label: "宽度: 100px",
        checked: settings.thumbnailSize === 100,
        onClick: () => { settings.thumbnailSize = 100; this.applySettings(); },
      },
      {
        label: "",
        checked: false,
        onClick: () => {},
        separator: true,
      },
      {
        label: "设置: 全局",
        checked: settings.isGlobal,
        onClick: () => { settings.isGlobal = true; this.applySettings(); },
      },
      {
        label: "设置: 独立",
        checked: !settings.isGlobal,
        onClick: () => { settings.isGlobal = false; this.applySettings(); },
      },
    ];

    for (const item of items) {
      if (item.separator) {
        const separator = document.createElement("div");
        separator.className = "adl-cm-minimap-menu-separator";
        menu.appendChild(separator);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = `adl-cm-minimap-menu-item${item.checked ? " adl-cm-minimap-menu-item--checked" : ""}`;
      el.textContent = item.label;
      el.addEventListener("click", () => {
        item.onClick();
        menu.remove();
      });
      menu.appendChild(el);
    }

    const rect = e.currentTarget instanceof Element ? e.currentTarget.getBoundingClientRect() : document.body.getBoundingClientRect();
    let menuX = e.clientX;
    let menuY = e.clientY;

    const menuWidth = 160;
    const menuHeight = items.filter(i => !i.separator).length * 28 + items.filter(i => i.separator).length * 8 + 8;

    if (menuX + menuWidth > window.innerWidth) {
      menuX = window.innerWidth - menuWidth - 8;
    }
    if (menuY + menuHeight > window.innerHeight) {
      menuY = window.innerHeight - menuHeight - 8;
    }

    menu.style.left = `${menuX}px`;
    menu.style.top = `${menuY}px`;
    document.body.appendChild(menu);

    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        document.removeEventListener("click", close);
        document.removeEventListener("contextmenu", close);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("contextmenu", close);
    }, 0);
  }

  private applySettings() {
    saveMinimapSettings(this.settings);
    this.render();
    this.updateSlider();
    this.updateScrollbarStyle();
  }
}

export function getMinimapExtension(options: CmMinimapExtensionOptions = {}): Extension[] {
  return [
    minimapDiffModelField,
    ViewPlugin.define((view) => new MinimapPlugin(view, options)),
  ];
}

export function updateMinimapDiffHunks(view: EditorView, hunks: AgentHunkDecoration[]) {
  view.dispatch({ effects: setMinimapDiffHunks.of(hunks) });
}

export function updateMinimapDiffModel(view: EditorView, model: CmMinimapDiffModel | null) {
  view.dispatch({ effects: setMinimapDiffModel.of(model) });
}
